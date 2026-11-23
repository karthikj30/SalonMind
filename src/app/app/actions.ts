"use server";
import { getTenantContext } from "@/lib/tenant";
import { done, fail } from "@/lib/flash";
import { emit, processEvents, tick, runAgent } from "@/lib/agents/runtime";
import { AGENTS } from "@/lib/agents/registry";
import { createBooking, findOrCreateClient, logPastVisit, rescheduleBooking } from "@/lib/services/booking";
import { issueInvoice } from "@/lib/services/invoicing";
import { sellGiftCard, sellPackage } from "@/lib/services/prepaid";
import { clockIn, clockOut } from "@/lib/services/backoffice";
import { importClients } from "@/lib/services/clientsImport";
import { encryptField } from "@/lib/security/crypto";
import { receiveMessage } from "@/lib/agents/crm";
import { computePayroll, screeningTurn } from "@/lib/agents/hr";
import { configureWorkflow, generateLayout, setAgentEnabled } from "@/lib/agents/platform";
import { embed, embeddingModel, toPgVector } from "@/lib/ai/embeddings";
import { sendMessage } from "@/lib/services/messaging";
import { translate } from "@/lib/ai/translate";
import { callWalkin, joinQueue, leaveQueue } from "@/lib/services/queue";
import { detectLang } from "@/lib/i18n/concierge";
import { LANGUAGES } from "@/lib/ai/llm";
import { addDays, istDate, todayIst, toIst } from "@/lib/time";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string, d = 0) => (fd.get(k) === null || s(fd, k) === "" ? d : Number(fd.get(k)));
const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

// ───────────── Services, rooms, staff ─────────────
async function indexService(db: Awaited<ReturnType<typeof getTenantContext>>["db"], id: string, text: string) {
  const e = await embed(text);
  await db.from("services").update({ embedding: toPgVector(e.vector), embedding_model: e.model }).eq("id", id);
}

export async function addService(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const row = {
    tenant_id: tenant.id, name: s(fd, "name"), category: s(fd, "category") || "hair", description: s(fd, "description") || null,
    duration_min: n(fd, "duration_min", 45), base_price: n(fd, "base_price"), min_skill_level: n(fd, "min_skill_level", 1),
    required_equipment: list(s(fd, "required_equipment")),
  };
  const { data, error } = await db.from("services").insert(row).select("id").single();
  if (error) fail("/app/services", error.message);
  await indexService(db, data.id, `${row.name}. ${row.category}. ${row.description ?? ""}`);
  await emit(db, tenant.id, "catalogue.changed", { service_id: data.id }, "human"); // → Translator Agent
  done("/app/services", `Service "${row.name}" added and indexed for AI search.`);
}

export async function addRecipe(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("service_products").upsert({ tenant_id: tenant.id, service_id: s(fd, "service_id"), product_id: s(fd, "product_id"), qty_per_service: n(fd, "qty") });
  if (error) fail("/app/services", error.message);
  done("/app/services", "Product usage recipe saved.");
}

export async function addRoom(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("rooms").insert({ tenant_id: tenant.id, name: s(fd, "name"), type: s(fd, "type") || "chair", equipment: list(s(fd, "equipment")) });
  if (error) fail("/app/services", error.message);
  done("/app/services", "Room/station added.");
}

export async function addStaff(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  let slabs;
  try { slabs = JSON.parse(s(fd, "commission_slabs") || "null"); } catch { fail("/app/staff", "Commission slabs must be valid JSON"); }
  const { error } = await db.from("staff").insert({
    tenant_id: tenant.id, name: s(fd, "name"), role: s(fd, "role") || "stylist", phone: s(fd, "phone") || null,
    skill_level: n(fd, "skill_level", 3), skills: list(s(fd, "skills")), employment_type: s(fd, "employment_type") || "employee",
    booth_rent_pct: n(fd, "booth_rent_pct"), base_salary: n(fd, "base_salary"), product_commission_pct: n(fd, "product_commission_pct", 5),
    hourly_cost: n(fd, "hourly_cost", 200), work_start: s(fd, "work_start") || "10:00", work_end: s(fd, "work_end") || "20:00",
    gender: s(fd, "gender") || null, pf_enabled: fd.get("pf_enabled") === "on", esi_enabled: fd.get("esi_enabled") === "on",
    ...(slabs ? { commission_slabs: slabs } : {}),
  });
  if (error) fail("/app/staff", error.message);
  done("/app/staff", "Staff member added.");
}

export async function toggleStaff(fd: FormData) {
  const { db } = await getTenantContext();
  await db.from("staff").update({ active: s(fd, "active") !== "true" }).eq("id", s(fd, "id"));
  done("/app/staff", "Updated.");
}

export async function addAdjustment(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("staff_adjustments").insert({ tenant_id: tenant.id, staff_id: s(fd, "staff_id"), kind: s(fd, "kind"), amount: n(fd, "amount"), note: s(fd, "note") || null });
  if (error) fail("/app/staff", error.message);
  done("/app/staff", "Adjustment recorded.");
}

export async function runPayroll(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const from = s(fd, "from"), to = s(fd, "to");
  const t0 = Date.now();
  const p = await computePayroll(db, tenant.id, from, to);
  await db.from("payroll_runs").insert({ tenant_id: tenant.id, period_start: from, period_end: to, lines: p.lines, total: p.total });
  await db.from("agent_runs").insert({ tenant_id: tenant.id, agent: "payroll", trigger: "manual", summary: `Payroll ${from}→${to}: ${p.lines.length} staff, total ₹${p.total.toLocaleString("en-IN")}`, provider: "rules-engine", duration_ms: Date.now() - t0 });
  done("/app/staff", `Payroll computed: ₹${p.total.toLocaleString("en-IN")}`);
}

// ───────────── Clients (incl. DPDP) ─────────────
export async function addClient(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("clients").insert({
    tenant_id: tenant.id, name: s(fd, "name"), phone: s(fd, "phone").replace(/\s+/g, "") || null, email: s(fd, "email") || null,
    language: s(fd, "language") || "en", notes: encryptField(s(fd, "notes") || null), consent_marketing: fd.get("consent") === "on",
    birthday: s(fd, "birthday") || null, referred_by: s(fd, "referred_by") || null,
  });
  if (error) fail("/app/clients", error.message.includes("duplicate") ? "A client with this phone already exists" : error.message);
  done("/app/clients", "Client added.");
}

export async function eraseClient(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const id = s(fd, "id");
  // DPDP Act right to erasure: anonymise PII, keep financial records (statutory retention) de-identified
  await db.from("messages").delete().eq("client_id", id);
  await db.from("campaigns").delete().eq("client_id", id);
  // consultation records (colour formulas, allergy tests) are personal/health data — deleted outright
  await db.from("client_formulas").delete().eq("client_id", id).eq("tenant_id", tenant.id);
  await db.from("patch_tests").delete().eq("client_id", id).eq("tenant_id", tenant.id);
  await db.from("clients").update({ name: "Erased client", phone: null, email: null, notes: null, consent_marketing: false }).eq("id", id).eq("tenant_id", tenant.id);
  done("/app/clients", "Client personal data erased (DPDP). Invoices retained in de-identified form.");
}

// ───────────── Bookings ─────────────
export async function bookAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const back = "/app/bookings";
  let clientId = s(fd, "client_id");
  try {
    if (!clientId) {
      if (!s(fd, "client_name")) throw new Error("Select a client or enter a new client name");
      clientId = (await findOrCreateClient(db, tenant.id, { name: s(fd, "client_name"), phone: s(fd, "client_phone") })).id;
    }
    const r = await createBooking(db, tenant, {
      client_id: clientId, service_id: s(fd, "service_id"), date: s(fd, "date"), time: s(fd, "time") || null,
      from: s(fd, "from") || null, to: s(fd, "to") || null, staff_id: s(fd, "staff_id") || null, source: s(fd, "source") || "walkin",
    });
    await processEvents(db, tenant);
    done(`${back}?date=${s(fd, "date")}`, `Booked ${r.service.name} with ${r.slot.staff.name} at ₹${r.booking.price} — ${r.booking.pricing_note}.`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(back, (e as Error).message);
  }
}

export async function setBookingStatus(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const id = s(fd, "id"), status = s(fd, "status");
  await db.from("bookings").update({ status }).eq("id", id);
  if (status === "cancelled") await emit(db, tenant.id, "booking.cancelled", { booking_id: id }, "human");
  if (status === "no_show") await emit(db, tenant.id, "booking.reviewed", { booking_id: id }, "human");
  await processEvents(db, tenant);
  done(`/app/bookings?date=${s(fd, "date")}`, `Booking marked ${status}.`);
}

export async function recordDeposit(fd: FormData) {
  const { db } = await getTenantContext();
  await db.from("bookings").update({ deposit_paid: n(fd, "amount"), status: "confirmed" }).eq("id", s(fd, "id"));
  done(`/app/bookings?date=${s(fd, "date")}`, "Deposit recorded; booking confirmed.");
}

export async function completeBooking(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const id = s(fd, "id");
  const rating = n(fd, "rating", 0) || null;
  const review = s(fd, "review") || null;
  await db.from("bookings").update({ status: "completed", rating, review }).eq("id", id);
  const { data: b } = await db.from("bookings").select("staff_id").eq("id", id).single();
  if (n(fd, "tip") > 0 && b?.staff_id) await db.from("staff_adjustments").insert({ tenant_id: tenant.id, staff_id: b.staff_id, kind: "tip", amount: n(fd, "tip"), note: "client tip" });
  const products = s(fd, "product_id") ? [{ product_id: s(fd, "product_id"), qty: n(fd, "product_qty", 1) }] : [];
  await emit(db, tenant.id, "booking.completed", { booking_id: id, payment_method: s(fd, "payment_method") || "upi", products,
    redeem_points: fd.get("redeem_points") === "on", use_wallet: fd.get("use_wallet") === "on",
    use_package: fd.get("use_package") === "on", gift_card_code: s(fd, "gift_card_code") || undefined }, "pos");
  if (review || rating) await emit(db, tenant.id, "booking.reviewed", { booking_id: id }, "pos");
  await processEvents(db, tenant);
  done(`/app/bookings?date=${s(fd, "date")}`, "Completed → invoice issued, inventory consumed, client scored. See Billing & Agent Console.");
}

// ───────────── Inbox ─────────────
export async function simulateInbound(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const handle = s(fd, "handle") || "guest";
  await receiveMessage(db, tenant.id, { channel: s(fd, "channel") || "whatsapp", handle, body: s(fd, "body"), name: s(fd, "name") || null });
  await processEvents(db, tenant);
  done(`/app/inbox?h=${encodeURIComponent(handle.replace(/\s/g, ""))}`, "Message received — AI concierge replied.");
}

export async function manualReply(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const handle = s(fd, "handle");
  let body = s(fd, "body");
  let meta: Record<string, unknown> = {};
  let note = "Reply sent.";
  // "Send in the customer's language": the owner types in any language, the customer reads their own
  const to = s(fd, "translate_to");
  if (to && to !== detectLang(body)) {
    const t = await translate(body, to);
    if (t.provider !== "none" && t.provider !== "same-language") {
      meta = { original: body, translated_by: t.provider, language: to };
      body = t.text;
      note = `Reply translated to ${LANGUAGES[to] ?? to} (${t.provider}) and sent.`;
    } else note = "Reply sent as typed — no translation provider answered.";
  }
  await sendMessage(db, { tenant_id: tenant.id, client_id: s(fd, "client_id") || null, contact_handle: handle, phone: handle, channel: s(fd, "channel"), body, agent: "human", meta });
  done(`/app/inbox?h=${encodeURIComponent(handle)}${s(fd, "tr") ? `&tr=${s(fd, "tr")}` : ""}`, note);
}

// ───────────── Marketing ─────────────
export async function createDeal(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("deals").insert({
    tenant_id: tenant.id, service_id: s(fd, "service_id") || null, title: s(fd, "title"), description: s(fd, "description") || null,
    kind: "manual", discount_pct: n(fd, "discount_pct"), valid_to: istDate(s(fd, "valid_to"), "23:59").toISOString(),
  });
  if (error) fail("/app/marketing", error.message);
  await emit(db, tenant.id, "catalogue.changed", { deal: s(fd, "title") }, "human");
  done("/app/marketing", "Deal published to the marketplace.");
}

export async function toggleDeal(fd: FormData) {
  const { db } = await getTenantContext();
  await db.from("deals").update({ active: s(fd, "active") !== "true" }).eq("id", s(fd, "id"));
  done("/app/marketing", "Deal updated.");
}

// ───────────── Recruitment ─────────────
export async function createJob(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { data, error } = await db.from("job_postings").insert({
    tenant_id: tenant.id, title: s(fd, "title"), role: s(fd, "role") || "stylist", description: s(fd, "description") || null,
    location: s(fd, "location") || tenant.city, salary_range: s(fd, "salary_range") || null,
  }).select("id").single();
  if (error) fail("/app/hr", error.message);
  await emit(db, tenant.id, "job.created", { job_id: data.id }, "human");
  await processEvents(db, tenant);
  done("/app/hr", "Job created — Recruitment Agent wrote the ads.");
}

export async function addCandidate(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { data, error } = await db.from("candidates").insert({
    tenant_id: tenant.id, job_id: s(fd, "job_id") || null, name: s(fd, "name"), phone: s(fd, "phone") || null, email: s(fd, "email") || null,
    source: s(fd, "source") || "manual", resume_text: encryptField(s(fd, "resume_text")),
  }).select("id").single();
  if (error) fail("/app/hr", error.message);
  await emit(db, tenant.id, "candidate.added", { candidate_id: data.id }, "human");
  await processEvents(db, tenant);
  done(`/app/hr?c=${data.id}`, "Candidate screened by the Recruitment Agent.");
}

export async function candidateReply(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const id = s(fd, "id");
  await screeningTurn(db, tenant, id, s(fd, "answer"));
  done(`/app/hr?c=${id}`, "Answer sent.");
}

export async function setCandidateStatus(fd: FormData) {
  const { db } = await getTenantContext();
  await db.from("candidates").update({ status: s(fd, "status") }).eq("id", s(fd, "id"));
  done(`/app/hr?c=${s(fd, "id")}`, "Candidate updated.");
}

// ───────────── Inventory ─────────────
export async function addVendor(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  let tiers;
  try { tiers = JSON.parse(s(fd, "price_tiers") || "null"); } catch { fail("/app/inventory", "Price tiers must be JSON"); }
  const { error } = await db.from("vendors").insert({
    tenant_id: tenant.id, name: s(fd, "name"), email: s(fd, "email") || null, phone: s(fd, "phone") || null, gstin: s(fd, "gstin") || null,
    state_code: s(fd, "state_code") || null, flexibility: n(fd, "flexibility", 0.5), ...(tiers ? { price_tiers: tiers } : {}),
  });
  if (error) fail("/app/inventory", error.message);
  done("/app/inventory", "Vendor added.");
}

export async function addProduct(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("products").insert({
    tenant_id: tenant.id, name: s(fd, "name"), brand: s(fd, "brand") || null, unit: s(fd, "unit") || "ml", vendor_id: s(fd, "vendor_id") || null,
    stock_qty: n(fd, "stock_qty"), reorder_level: n(fd, "reorder_level"), unit_cost: n(fd, "unit_cost"), retail_price: n(fd, "retail_price"),
    gst_rate: n(fd, "gst_rate", 18), hsn: s(fd, "hsn") || "3305", lead_time_days: n(fd, "lead_time_days", 3),
  });
  if (error) fail("/app/inventory", error.message);
  done("/app/inventory", "Product added.");
}

export async function logUsage(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const productId = s(fd, "product_id"), bookingId = s(fd, "booking_id") || null;
  let expected = n(fd, "expected_qty");
  let staffId = s(fd, "staff_id") || null;
  if (bookingId) {
    const { data: b } = await db.from("bookings").select("service_id, staff_id").eq("id", bookingId).single();
    staffId = staffId ?? b?.staff_id ?? null;
    const { data: r } = await db.from("service_products").select("qty_per_service").eq("service_id", b?.service_id).eq("product_id", productId).maybeSingle();
    if (r) expected = Number(r.qty_per_service);
  }
  const actual = n(fd, "actual_qty");
  const { data, error } = await db.from("usage_logs").insert({ tenant_id: tenant.id, product_id: productId, booking_id: bookingId, staff_id: staffId, expected_qty: expected, actual_qty: actual, source: s(fd, "source") || "scale" }).select("id").single();
  if (error) fail("/app/inventory", error.message);
  const { data: p } = await db.from("products").select("stock_qty").eq("id", productId).single();
  // if the auto-recipe already deducted `expected`, only deduct the excess
  const deduct = bookingId ? Math.max(0, actual - expected) : actual;
  await db.from("products").update({ stock_qty: Number(p?.stock_qty ?? 0) - deduct }).eq("id", productId);
  await emit(db, tenant.id, "usage.logged", { usage_id: data.id }, "smart-scale");
  await processEvents(db, tenant);
  done("/app/inventory", "Usage logged — Waste Agent evaluated it.");
}

export async function setPoStatus(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const id = s(fd, "id"), status = s(fd, "status");
  if (status === "received") {
    const { data: po } = await db.from("purchase_orders").select("items").eq("id", id).single();
    for (const it of (po?.items ?? []) as { product_id: string; qty: number }[]) {
      const { data: p } = await db.from("products").select("stock_qty").eq("id", it.product_id).single();
      if (p) await db.from("products").update({ stock_qty: Number(p.stock_qty) + Number(it.qty) }).eq("id", it.product_id);
    }
    await db.from("purchase_orders").update({ status, received_at: new Date().toISOString() }).eq("id", id);
    await emit(db, tenant.id, "gst.prepare", { period: todayIst().slice(0, 7) }, "human");
    await processEvents(db, tenant);
  } else await db.from("purchase_orders").update({ status }).eq("id", id);
  done("/app/inventory", `PO ${status}.`);
}

// ───────────── Billing ─────────────
export async function prepareGst(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  await emit(db, tenant.id, "gst.prepare", { period: s(fd, "period") || todayIst().slice(0, 7) }, "human");
  await processEvents(db, tenant);
  done(`/app/billing?period=${s(fd, "period")}`, "GST return drafts prepared.");
}

// ───────────── Agents ─────────────
export async function runAgentNow(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const id = s(fd, "agent");
  if (id === "all") {
    const r = await tick(db, tenant);
    done("/app/agents", `Orchestrator ran ${r.results.length} agents and processed ${r.events} event(s).`);
  }
  const def = AGENTS.find((a) => a.id === id);
  if (!def) fail("/app/agents", "Unknown agent");
  const out = await runAgent(def, { db, tenant, trigger: "manual" });
  const ev = await processEvents(db, tenant);
  done("/app/agents", `${def.name}: ${out.summary}${ev ? ` (+${ev} follow-up event(s))` : ""}`);
}

export async function drainQueue() {
  const { db, tenant } = await getTenantContext();
  await db.from("agent_events").update({ status: "pending" }).eq("tenant_id", tenant.id).in("status", ["processing", "failed"]);
  const n2 = await processEvents(db, tenant);
  done("/app/agents", `Processed ${n2} event(s).`);
}

// ───────────── Studio & settings ─────────────
export async function generateLayoutAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const r = await generateLayout(db, tenant, s(fd, "prompt"), s(fd, "language") || "en");
  done("/app/studio", `Generated ${r.widgets.length} widgets via ${r.provider}. It's now on your dashboard.`);
}

export async function resetLayout() {
  const { db, tenant } = await getTenantContext();
  await db.from("tenants").update({ ui_layout: null }).eq("id", tenant.id);
  done("/app/studio", "Dashboard reset to default.");
}

export async function updateSalon(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const [state_code, state] = s(fd, "state").split("|");
  const { error } = await db.from("tenants").update({
    name: s(fd, "name"), city: s(fd, "city"), state, state_code, gstin: s(fd, "gstin") || null, address: s(fd, "address"), phone: s(fd, "phone"),
    description: s(fd, "description"), google_review_url: s(fd, "google_review_url") || null, upi_vpa: s(fd, "upi_vpa") || null, open_time: s(fd, "open_time"), close_time: s(fd, "close_time"), is_published: fd.get("is_published") === "on",
  }).eq("id", tenant.id);
  if (error) fail("/app/settings", error.message);
  if (s(fd, "description") !== (tenant.description ?? "")) await emit(db, tenant.id, "catalogue.changed", { field: "description" }, "human");
  done("/app/settings", "Salon profile saved.");
}

export async function updateSettings(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const next = { ...tenant.settings };
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if (fd.get(k) === null || Array.isArray(next[k])) continue;
    (next as Record<string, unknown>)[k] = k === "default_language" ? s(fd, k) : n(fd, k);
  }
  await db.from("tenants").update({ settings: next }).eq("id", tenant.id);
  done("/app/settings", "Agent parameters saved.");
}

export async function reindexServices() {
  const { db, tenant } = await getTenantContext();
  const { data } = await db.from("services").select("id, name, category, description").eq("tenant_id", tenant.id);
  for (const sv of data ?? []) await indexService(db, sv.id, `${sv.name}. ${sv.category}. ${sv.description ?? ""}`);
  done("/app/settings", `Re-indexed ${data?.length ?? 0} services with ${embeddingModel()}.`);
}

// ───────────── Growth features: reschedule, past visits, waitlist, leave, memberships, wallet ─────────────
export async function rescheduleAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const date = s(fd, "new_date");
  try {
    const r = await rescheduleBooking(db, tenant, s(fd, "id"), date, s(fd, "new_time"));
    await processEvents(db, tenant);
    done(`/app/bookings?date=${date}`, `Rescheduled to ${date} ${s(fd, "new_time")} with ${r.slot.staff.name} (₹${r.booking.price}). Freed slot offered to waitlist / marketplace.`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(`/app/bookings?date=${s(fd, "date")}`, (e as Error).message);
  }
}

export async function logPastVisitAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  try {
    await logPastVisit(db, tenant, {
      client_id: s(fd, "client_id"), service_id: s(fd, "service_id"), staff_id: s(fd, "staff_id") || null, date: s(fd, "date"),
      price: s(fd, "price") ? n(fd, "price") : null, rating: n(fd, "rating", 0) || null, review: s(fd, "review") || null,
    });
    await processEvents(db, tenant);
  } catch (e) {
    fail("/app/clients", (e as Error).message);
  }
  done("/app/clients", "Past visit imported — Churn Agent recalculated the client's visit cycle.");
}

export async function addToWaitlist(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("waitlist").insert({
    tenant_id: tenant.id, client_id: s(fd, "client_id"), service_id: s(fd, "service_id"), date: s(fd, "date") || null,
    from_time: s(fd, "from") || null, to_time: s(fd, "to") || null,
  });
  if (error) fail("/app/bookings", error.message);
  done(`/app/bookings?date=${s(fd, "date") || todayIst()}`, "Added to waitlist — the Waitlist Agent will offer the first matching freed slot.");
}

export async function bookWaitlistOffer(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { data: w } = await db.from("waitlist").select("*").eq("id", s(fd, "id")).single();
  if (!w?.offered_slot) fail("/app/bookings", "No offered slot on this entry");
  const t = toIst(new Date(w.offered_slot));
  try {
    const r = await createBooking(db, tenant, { client_id: w.client_id, service_id: w.service_id, date: t.date, time: t.time, source: "waitlist" });
    await db.from("waitlist").update({ status: "booked", booking_id: r.booking.id }).eq("id", w.id);
    await processEvents(db, tenant);
    done(`/app/bookings?date=${t.date}`, "Waitlist offer converted to a booking.");
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    await db.from("waitlist").update({ status: "waiting", offered_slot: null }).eq("id", w.id);
    fail("/app/bookings", `${(e as Error).message} — entry put back on the waitlist`);
  }
}

export async function addTimeOff(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const from = s(fd, "from_date"), to = s(fd, "to_date") || from;
  const { error } = await db.from("staff_time_off").insert({
    tenant_id: tenant.id, staff_id: s(fd, "staff_id"), reason: s(fd, "reason") || null,
    start_at: istDate(from, s(fd, "from_time") || "00:00").toISOString(), end_at: istDate(to, s(fd, "to_time") || "23:59").toISOString(),
  });
  if (error) fail("/app/staff", error.message);
  done("/app/staff", "Leave / blocked time saved — the scheduler will not offer these hours.");
}

export async function deleteTimeOff(fd: FormData) {
  const { db } = await getTenantContext();
  await db.from("staff_time_off").delete().eq("id", s(fd, "id"));
  done("/app/staff", "Leave removed.");
}

export async function createPlan(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("membership_plans").insert({
    tenant_id: tenant.id, name: s(fd, "name"), price: n(fd, "price"), discount_pct: n(fd, "discount_pct"),
    validity_days: n(fd, "validity_days", 365), wallet_credit: n(fd, "wallet_credit"),
  });
  if (error) fail("/app/loyalty", error.message);
  done("/app/loyalty", "Membership plan created.");
}

export async function sellMembership(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { data: plan } = await db.from("membership_plans").select("*").eq("id", s(fd, "plan_id")).single();
  const clientId = s(fd, "client_id");
  if (!plan || !clientId) fail("/app/loyalty", "Choose a plan and a client");
  const { data: cm } = await db.from("client_memberships").insert({ tenant_id: tenant.id, client_id: clientId, plan_id: plan.id, ends_at: addDays(todayIst(), plan.validity_days) }).select("id").single();
  if (Number(plan.wallet_credit) > 0) {
    const { data: c } = await db.from("clients").select("wallet_balance").eq("id", clientId).single();
    await db.from("clients").update({ wallet_balance: Number(c?.wallet_balance ?? 0) + Number(plan.wallet_credit) }).eq("id", clientId);
    await db.from("wallet_transactions").insert({ tenant_id: tenant.id, client_id: clientId, kind: "membership_credit", amount: plan.wallet_credit, ref: cm?.id, note: plan.name });
  }
  const r = await issueInvoice(db, tenant, {
    client_id: clientId, method: s(fd, "payment_method") || "upi",
    lines: [{ description: `Membership: ${plan.name} (${plan.validity_days} days)`, kind: "service", code: "999799", qty: 1, rate: tenant.settings.gst_rate, unit_price: Number(plan.price) }],
  });
  await emit(db, tenant.id, "invoice.issued", { invoice_id: r.id, client_id: clientId, total: r.inv.total }, "pos");
  await processEvents(db, tenant);
  done("/app/loyalty", `Sold ${plan.name} — invoice ${r.number} (${r.inv.total}).`);
}

export async function walletTopup(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const clientId = s(fd, "client_id"), amt = n(fd, "amount");
  if (!clientId || amt <= 0) fail("/app/loyalty", "Choose a client and a positive amount");
  const { data: c } = await db.from("clients").select("wallet_balance").eq("id", clientId).single();
  await db.from("clients").update({ wallet_balance: Number(c?.wallet_balance ?? 0) + amt }).eq("id", clientId);
  await db.from("wallet_transactions").insert({ tenant_id: tenant.id, client_id: clientId, kind: "topup", amount: amt, note: `via ${s(fd, "payment_method") || "upi"}` });
  done("/app/loyalty", "Wallet topped up. (GST is charged when the balance is redeemed against a service.)");
}

// ───────────── Gift cards & prepaid packages ─────────────
export async function sellGiftCardAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  let code = "";
  try {
    const g = await sellGiftCard(db, tenant, {
      amount: n(fd, "amount"), validity_days: n(fd, "validity_days", 365), payment_method: s(fd, "payment_method") || "upi",
      buyer_name: s(fd, "buyer_name"), buyer_phone: s(fd, "buyer_phone").replace(/\s+/g, ""),
      recipient_name: s(fd, "recipient_name"), recipient_phone: s(fd, "recipient_phone").replace(/\s+/g, ""), message: s(fd, "message"),
    });
    code = g.code;
    await processEvents(db, tenant);
  } catch (e) {
    fail("/app/loyalty", (e as Error).message);
  }
  done("/app/loyalty", `Gift card ${code} issued — the code was sent on WhatsApp. No GST now: it is charged on the service when the card is redeemed.`);
}

export async function voidGiftCard(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  await db.from("gift_cards").update({ status: "void" }).eq("id", s(fd, "id")).eq("tenant_id", tenant.id);
  done("/app/loyalty", "Gift card cancelled.");
}

export async function createPackagePlan(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("package_plans").insert({
    tenant_id: tenant.id, name: s(fd, "name"), service_id: s(fd, "service_id"), sessions: n(fd, "sessions", 5),
    price: n(fd, "price"), validity_days: n(fd, "validity_days", 180),
  });
  if (error) fail("/app/loyalty", error.message);
  done("/app/loyalty", "Package created.");
}

export async function sellPackageAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  let msg = "";
  try {
    if (!s(fd, "client_id") || !s(fd, "plan_id")) throw new Error("Choose a client and a package");
    const r = await sellPackage(db, tenant, { client_id: s(fd, "client_id"), plan_id: s(fd, "plan_id"), payment_method: s(fd, "payment_method") || "upi" });
    await processEvents(db, tenant);
    msg = `Sold ${r.plan.name} — invoice ${r.invoice.number} (${r.invoice.inv.total}). Sessions are used automatically at checkout.`;
  } catch (e) {
    fail("/app/loyalty", (e as Error).message);
  }
  done("/app/loyalty", msg);
}

// ───────────── Attendance, consultation cards, expenses ─────────────
export async function clockAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const staffId = s(fd, "staff_id"), dir = s(fd, "dir");
  try {
    if (dir === "out") await clockOut(db, tenant.id, staffId); else await clockIn(db, tenant.id, staffId, "desk");
  } catch (e) { fail("/app/staff", (e as Error).message); }
  done("/app/staff", dir === "out" ? "Clocked out." : "Clocked in — attendance feeds this month's payroll.");
}

export async function addFormula(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const clientId = s(fd, "client_id"), back = `/app/clients/${clientId}`;
  const { error } = await db.from("client_formulas").insert({
    tenant_id: tenant.id, client_id: clientId, service_id: s(fd, "service_id") || null, staff_id: s(fd, "staff_id") || null,
    formula: s(fd, "formula"), developer: s(fd, "developer") || null, processing_min: n(fd, "processing_min") || null, notes: s(fd, "notes") || null,
  });
  if (error) fail(back, error.message);
  done(back, "Colour formula saved to the client's card.");
}

export async function addPatchTest(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const clientId = s(fd, "client_id"), back = `/app/clients/${clientId}`;
  const { error } = await db.from("patch_tests").insert({
    tenant_id: tenant.id, client_id: clientId, product: s(fd, "product"), tested_on: s(fd, "tested_on") || todayIst(),
    result: ["pass", "fail", "pending"].includes(s(fd, "result")) ? s(fd, "result") : "pending", staff_id: s(fd, "staff_id") || null, notes: s(fd, "notes") || null,
  });
  if (error) fail(back, error.message);
  done(back, "Patch test recorded.");
}

export async function setPatchResult(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const clientId = s(fd, "client_id");
  await db.from("patch_tests").update({ result: s(fd, "result") === "fail" ? "fail" : "pass" }).eq("id", s(fd, "id")).eq("tenant_id", tenant.id);
  done(`/app/clients/${clientId}`, "Patch test result updated.");
}

export async function addExpense(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("expenses").insert({
    tenant_id: tenant.id, spent_on: s(fd, "spent_on") || todayIst(), category: s(fd, "category") || "other", amount: n(fd, "amount"),
    gst_paid: n(fd, "gst_paid"), paid_via: s(fd, "paid_via") || "upi", note: s(fd, "note") || null,
  });
  if (error) fail("/app/billing", error.message.includes("amount") ? "Enter an amount above ₹0" : error.message);
  done("/app/billing", "Expense recorded — the profit & loss updates instantly.");
}

export async function deleteExpense(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  await db.from("expenses").delete().eq("id", s(fd, "id")).eq("tenant_id", tenant.id);
  done("/app/billing", "Expense removed.");
}

// ───────────── Ported from open source: CSV import (pronto), human handoff (Kontor) ─────────────
export async function importClientsCsv(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const file = fd.get("file");
  const text = file instanceof File && file.size ? await file.text() : s(fd, "csv");
  if (!text) fail("/app/clients", "Choose a CSV file or paste CSV text");
  if (text.length > 4_000_000) fail("/app/clients", "CSV too large (max ~4 MB) — split it");
  try {
    const r = await importClients(db, tenant.id, text, fd.get("consent") === "on");
    done("/app/clients", `Imported ${r.imported} client(s); ${r.duplicates} already existed; ${r.skipped} row(s) skipped (no name / duplicate phone).`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail("/app/clients", (e as Error).message);
  }
}

export async function setConversationStatus(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const handle = s(fd, "handle"), status = s(fd, "status") === "human" ? "human" : "ai";
  await db.from("conversations").upsert({ tenant_id: tenant.id, contact_handle: handle, status, reason: status === "human" ? "taken over by staff" : null, unclear_count: 0, updated_at: new Date().toISOString() });
  done(`/app/inbox?h=${encodeURIComponent(handle)}`, status === "ai" ? "Handed back to the AI concierge." : "You are now handling this conversation; the AI will stay silent.");
}

// ───────────── Walk-in token queue ─────────────
export async function addWalkin(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  let msg = "";
  try {
    const t = await joinQueue(db, tenant, { name: s(fd, "name"), phone: s(fd, "phone") || null, service_id: s(fd, "service_id") || null, source: "desk" });
    await processEvents(db, tenant, 5);
    msg = `Token ${t.token_no} issued to ${s(fd, "name")}.`;
  } catch (e) { fail("/app/bookings", (e as Error).message); }
  done("/app/bookings", msg);
}

export async function callWalkinAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  let msg = "";
  try {
    const r = await callWalkin(db, tenant, s(fd, "id"));
    await processEvents(db, tenant, 8);
    msg = `Token ${r.token_no}: ${r.service} with ${r.stylist} at ${r.time}. Complete it from the schedule when done.`;
  } catch (e) { fail("/app/bookings", (e as Error).message); }
  done("/app/bookings", msg);
}

export async function walkinLeft(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  await leaveQueue(db, tenant, s(fd, "id"));
  await processEvents(db, tenant, 5);
  done("/app/bookings", "Removed from the queue.");
}

export async function translateCatalogue() {
  const { db, tenant } = await getTenantContext();
  const def = AGENTS.find((a) => a.id === "translator")!;
  const out = await runAgent(def, { db, tenant, trigger: "manual" });
  done("/app/settings", out.summary);
}

// ───────────── Workflow designer (plain-language configuration) ─────────────
export async function configureWorkflowAction(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const prompt = s(fd, "prompt");
  if (!prompt) fail("/app/studio", "Describe what you want to change");
  const r = await configureWorkflow(db, tenant, prompt);
  if (!r.changed) fail("/app/studio", `Nothing to change understood from that${r.plan.notes.length ? " — " + r.plan.notes.join(" ") : ""}. Try e.g. "turn off the waitlist and ask for a 40% deposit".`);
  done("/app/studio", `Applied ${r.changed} change(s): ${r.actions.filter((a) => a.type !== "note").map((a) => a.label).join("; ")}${r.plan.notes.length ? " · " + r.plan.notes.join(" ") : ""}`);
}

export async function toggleAgent(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const plan = await setAgentEnabled(db, tenant, s(fd, "agent"), s(fd, "enabled") === "true");
  if (plan.notes.length) fail("/app/studio", plan.notes.join(" "));
  done("/app/studio", `${s(fd, "agent")} ${s(fd, "enabled") === "true" ? "resumed" : "paused"}.`);
}
