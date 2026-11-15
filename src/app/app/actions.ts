"use server";
import { getTenantContext } from "@/lib/tenant";
import { done, fail } from "@/lib/flash";
import { emit, processEvents, tick, runAgent } from "@/lib/agents/runtime";
import { AGENTS } from "@/lib/agents/registry";
import { createBooking, findOrCreateClient } from "@/lib/services/booking";
import { receiveMessage } from "@/lib/agents/crm";
import { computePayroll, screeningTurn } from "@/lib/agents/hr";
import { generateLayout } from "@/lib/agents/platform";
import { embed, embeddingModel, toPgVector } from "@/lib/ai/embeddings";
import { sendMessage } from "@/lib/services/messaging";
import { istDate, todayIst } from "@/lib/time";

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
    language: s(fd, "language") || "en", notes: s(fd, "notes") || null, consent_marketing: fd.get("consent") === "on",
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
  await emit(db, tenant.id, "booking.completed", { booking_id: id, payment_method: s(fd, "payment_method") || "upi", products }, "pos");
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
  await sendMessage(db, { tenant_id: tenant.id, client_id: s(fd, "client_id") || null, contact_handle: handle, phone: handle, channel: s(fd, "channel"), body: s(fd, "body"), agent: "human" });
  done(`/app/inbox?h=${encodeURIComponent(handle)}`, "Reply sent.");
}

// ───────────── Marketing ─────────────
export async function createDeal(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const { error } = await db.from("deals").insert({
    tenant_id: tenant.id, service_id: s(fd, "service_id") || null, title: s(fd, "title"), description: s(fd, "description") || null,
    kind: "manual", discount_pct: n(fd, "discount_pct"), valid_to: istDate(s(fd, "valid_to"), "23:59").toISOString(),
  });
  if (error) fail("/app/marketing", error.message);
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
    source: s(fd, "source") || "manual", resume_text: s(fd, "resume_text"),
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
    description: s(fd, "description"), open_time: s(fd, "open_time"), close_time: s(fd, "close_time"), is_published: fd.get("is_published") === "on",
  }).eq("id", tenant.id);
  if (error) fail("/app/settings", error.message);
  done("/app/settings", "Salon profile saved.");
}

export async function updateSettings(fd: FormData) {
  const { db, tenant } = await getTenantContext();
  const next = { ...tenant.settings };
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if (fd.get(k) === null) continue;
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
