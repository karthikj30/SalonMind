/**
 * RFP integration suite — runs every agent against the REAL Supabase database (no mocks, no seed data).
 * It creates a throw-away salon through the same service functions the UI uses, asserts on what agents
 * actually wrote to Postgres, then deletes everything.
 *
 *   npm run test:integration      (needs .env.local: Supabase URL/key + agent service account)
 *
 * LLM keys are ignored unless USE_LLM_IN_TESTS=1, so assertions are deterministic (rules engine).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (!process.env.USE_LLM_IN_TESTS) for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "HF_TOKEN", "OLLAMA_BASE_URL"]) delete process.env[k];

const { AGENTS } = await import("../../src/lib/agents/registry");
const { normalizeTenant, processEvents, runAgent, emit, tick } = await import("../../src/lib/agents/runtime");
const { createBooking, findOrCreateClient, planBooking, logPastVisit, rescheduleBooking } = await import("../../src/lib/services/booking");
const { importClients } = await import("../../src/lib/services/clientsImport");
const { receiveMessage } = await import("../../src/lib/agents/crm");
const { computePayroll, screeningTurn } = await import("../../src/lib/agents/hr");
const { generateLayout, configureWorkflow } = await import("../../src/lib/agents/platform");
const { searchMarketplace } = await import("../../src/lib/services/marketplace");
const { issueInvoice } = await import("../../src/lib/services/invoicing");
const { embed, toPgVector } = await import("../../src/lib/ai/embeddings");
const { addDays, istDate, todayIst, toIst } = await import("../../src/lib/time");
const { translate, translateKeeping } = await import("../../src/lib/ai/translate");
const { loadTranslations } = await import("../../src/lib/agents/i18n");
const { sourceHash } = await import("../../src/lib/domain/translate");
const { interpretVoice } = await import("../../src/lib/agents/voice");
const { callWalkin, joinQueue, leaveQueue, queueState } = await import("../../src/lib/services/queue");
const { summariseDay } = await import("../../src/lib/domain/dayclose");
const { sellGiftCard, sellPackage, findUsableGiftCard } = await import("../../src/lib/services/prepaid");
const { clockIn, clockOut, monthlyPnl } = await import("../../src/lib/services/backoffice");
type Tenant = import("../../src/lib/agents/types").Tenant;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ts = Date.now().toString(36);
const today = todayIst();
const tomorrow = addDays(today, 1);
let db: SupabaseClient;
let tenant: Tenant;
const ids: Record<string, string> = {};
const agent = (id: string) => AGENTS.find((a) => a.id === id)!;
const ctx = () => ({ db, tenant, trigger: "test" });
const refresh = async () => { tenant = normalizeTenant((await db.from("tenants").select("*").eq("id", tenant.id).single()).data as Tenant); };
const lastRun = async (agentId: string) => (await db.from("agent_runs").select("*").eq("tenant_id", tenant.id).eq("agent", agentId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
async function ins<T = { id: string }>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.from(table).insert({ tenant_id: tenant.id, ...row }).select("*").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}
async function addService(name: string, category: string, price: number, dur: number, minSkill = 1, equipment: string[] = []) {
  const s = await ins("services", { name, category, base_price: price, duration_min: dur, min_skill_level: minSkill, required_equipment: equipment, description: `${name} ${category}` });
  const e = await embed(`${name}. ${category}.`);
  await db.from("services").update({ embedding: toPgVector(e.vector), embedding_model: e.model }).eq("id", s.id);
  return s.id;
}

before(async () => {
  db = mk();
  const { error } = await db.auth.signInWithPassword({ email: process.env.AGENT_BOT_EMAIL!, password: process.env.AGENT_BOT_PASSWORD! });
  assert.ifError(error);
  const { data, error: e2 } = await db.from("tenants").insert({
    name: `IT Salon ${ts}`, slug: `it-salon-${ts}`, city: "Pune", state: "Maharashtra", state_code: "27", gstin: "27AAAAA0000A1Z5",
    is_published: true, google_review_url: "https://g.page/r/it-test/review", upi_vpa: "itsalon@okhdfcbank",
  }).select("*").single();
  assert.ifError(e2);
  tenant = normalizeTenant(data as Tenant);
  ids.asha = (await ins("staff", { name: "Asha", skill_level: 5, skills: ["colour", "balayage"], hourly_cost: 400 })).id;
  ids.ravi = (await ins("staff", { name: "Ravi", skill_level: 3, skills: ["hair", "grooming"], employment_type: "booth_renter", booth_rent_pct: 30, hourly_cost: 150 })).id;
  ids.neha = (await ins("staff", { name: "Neha", skill_level: 2, skills: ["skin"], hourly_cost: 120, base_salary: 12000 })).id;
  ids.bay = (await ins("rooms", { name: "Colour bay", equipment: ["wash basin"] })).id;
  ids.chair = (await ins("rooms", { name: "Chair 1", equipment: [] })).id;
  ids.balayage = await addService("Balayage", "colour", 2500, 120, 4, ["wash basin"]);
  ids.haircut = await addService("Men's haircut", "grooming", 500, 45, 1);
  ids.facial = await addService("Classic facial", "skin", 900, 60, 1);
  ids.vendorLocal = (await ins("vendors", { name: "Pune Beauty Supplies", state_code: "27", flexibility: 0.8 })).id;
  ids.vendorOut = (await ins("vendors", { name: "Bengaluru Wholesale", state_code: "29", flexibility: 0.3 })).id;
  ids.lightener = (await ins("products", { name: "Lightener", unit: "g", stock_qty: 90, reorder_level: 100, unit_cost: 4, vendor_id: ids.vendorLocal, lead_time_days: 4 })).id;
  ids.serum = (await ins("products", { name: "Serum", unit: "pcs", stock_qty: 50, reorder_level: 5, unit_cost: 300, retail_price: 650, vendor_id: ids.vendorOut })).id;
  await db.from("service_products").insert({ tenant_id: tenant.id, service_id: ids.balayage, product_id: ids.lightener, qty_per_service: 40 });
});

after(async () => {
  if (tenant?.id) await db.from("tenants").delete().eq("id", tenant.id);
});

describe("Module 3 — scheduling, pricing, no-show", () => {
  test("Dynamic matrix scheduling respects skill, equipment & room; prices via yield engine", async () => {
    const c = await findOrCreateClient(db, tenant.id, { name: "Priya", phone: "+919811100001", language: "hi" });
    ids.priya = c.id;
    const r = await createBooking(db, tenant, { client_id: c.id, service_id: ids.balayage, date: tomorrow, time: "11:00", source: "walkin" });
    assert.equal(r.slot.staff.id, ids.asha, "only the L5 colourist qualifies");
    assert.equal(r.slot.room?.id, ids.bay, "needs the room with a wash basin");
    assert.ok(r.booking.pricing_note && r.booking.price > 0);
    ids.b1 = r.booking.id;
    await assert.rejects(createBooking(db, tenant, { client_id: c.id, service_id: ids.balayage, date: tomorrow, time: "12:00", source: "walkin" }), /No stylist/);
  });

  test("Postgres exclusion constraint makes double-booking impossible (even bypassing the scheduler)", async () => {
    const { data: b } = await db.from("bookings").select("*").eq("id", ids.b1).single();
    const { error } = await db.from("bookings").insert({ tenant_id: tenant.id, client_id: ids.priya, service_id: ids.balayage, staff_id: b!.staff_id,
      start_at: new Date(new Date(b!.start_at).getTime() + 30 * 60000).toISOString(), end_at: new Date(new Date(b!.end_at).getTime() + 30 * 60000).toISOString(), status: "booked" });
    assert.ok(error && /no_staff_overlap/.test(error.message), error?.message);
    const { error: roomErr } = await db.from("bookings").insert({ tenant_id: tenant.id, client_id: ids.priya, service_id: ids.balayage, room_id: ids.bay, staff_id: null,
      start_at: b!.start_at, end_at: b!.end_at, status: "confirmed" });
    assert.ok(roomErr && /no_room_overlap/.test(roomErr.message), roomErr?.message);
  });

  test("Festival rush: 20 simultaneous bookings for one slot → exactly one wins, no double booking", async () => {
    const date = addDays(today, 6);
    const clients = await Promise.all(Array.from({ length: 20 }, (_, i) => findOrCreateClient(db, tenant.id, { name: `Rush ${i}`, phone: `+9197000000${String(i).padStart(2, "0")}` })));
    const results = await Promise.allSettled(clients.map((c) => createBooking(db, tenant, { client_id: c.id, service_id: ids.balayage, date, time: "14:00", source: "marketplace" })));
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1, `exactly one booking succeeds (got ${ok.length})`);
    for (const r of results) if (r.status === "rejected") assert.match(String(r.reason?.message), /taken|No stylist/);
    const { data } = await db.from("bookings").select("id").eq("tenant_id", tenant.id).eq("service_id", ids.balayage).gte("start_at", istDate(date, "00:00").toISOString()).lte("start_at", istDate(date, "23:59").toISOString()).in("status", ["booked", "confirmed"]);
    assert.equal(data!.length, 1);
    await db.from("bookings").update({ status: "cancelled" }).eq("id", data![0].id);
    await db.from("agent_events").update({ status: "done" }).eq("tenant_id", tenant.id).eq("status", "pending");
  });

  test("Staff leave blocks the scheduler", async () => {
    await ins("staff_time_off", { staff_id: ids.neha, start_at: istDate(tomorrow, "00:00").toISOString(), end_at: istDate(tomorrow, "23:59").toISOString(), reason: "sick" });
    const plan = await planBooking(db, tenant, { service_id: ids.facial, date: tomorrow }, 30);
    assert.ok(plan.slots.length > 0 && plan.slots.every((s) => s.staff.id !== ids.neha));
  });

  test("No-show mitigation: risky client gets a deposit demand + nudge", async () => {
    const c = await findOrCreateClient(db, tenant.id, { name: "Flaky", phone: "+919811100002" });
    ids.flaky = c.id;
    for (const d of [-30, -20, -10]) await ins("bookings", { client_id: c.id, service_id: ids.haircut, start_at: istDate(addDays(today, d), "12:00").toISOString(), end_at: istDate(addDays(today, d), "12:45").toISOString(), status: "no_show", price: 500, is_historical: true });
    const r = await createBooking(db, tenant, { client_id: c.id, service_id: ids.haircut, date: tomorrow, time: "18:00", source: "marketplace" });
    await processEvents(db, tenant);
    const { data: b } = await db.from("bookings").select("no_show_risk, deposit_required").eq("id", r.booking.id).single();
    assert.ok(b!.no_show_risk >= tenant.settings.deposit_threshold, `risk ${b!.no_show_risk}`);
    assert.ok(Number(b!.deposit_required) > 0);
    const { data: m } = await db.from("messages").select("body").eq("client_id", c.id).eq("agent", "noshow");
    assert.ok(m!.length >= 1 && /deposit/i.test(m![0].body));
    assert.match(m![0].body, /upi:\/\/pay\?pa=itsalon%40okhdfcbank&pn=IT%20Salon/, "deposit nudge carries an NPCI UPI link");
  });

  test("Yield management: cancellation → last-minute deal; waitlist offered the slot; YES books it", async () => {
    const w = await findOrCreateClient(db, tenant.id, { name: "Waiting Wanda", phone: "+919811100003" });
    await ins("waitlist", { client_id: w.id, service_id: ids.haircut, date: tomorrow });
    const { data: nb } = await db.from("bookings").select("id, start_at").eq("client_id", ids.flaky).eq("status", "booked").single();
    await db.from("bookings").update({ status: "cancelled" }).eq("id", nb!.id);
    await emit(db, tenant.id, "booking.cancelled", { booking_id: nb!.id }, "test");
    await processEvents(db, tenant);
    const { data: deal } = await db.from("deals").select("kind").eq("tenant_id", tenant.id).eq("kind", "last_minute");
    assert.equal(deal!.length, 1);
    const { data: wl } = await db.from("waitlist").select("status, offered_slot").eq("client_id", w.id).single();
    assert.equal(wl!.status, "offered");
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: "+919811100003", body: "YES" });
    await processEvents(db, tenant);
    const { data: wl2 } = await db.from("waitlist").select("status, booking_id").eq("client_id", w.id).single();
    assert.equal(wl2!.status, "booked");
    const { data: nbk } = await db.from("bookings").select("start_at, source").eq("id", wl2!.booking_id).single();
    assert.equal(nbk!.source, "waitlist"); assert.equal(nbk!.start_at.slice(0, 16), new Date(wl!.offered_slot).toISOString().slice(0, 16));
  });

  test("Reschedule moves the booking through the scheduler", async () => {
    const r = await rescheduleBooking(db, tenant, ids.b1, tomorrow, "15:00");
    assert.equal(toIst(new Date(r.booking.start_at)).time, "15:00");
    assert.ok(r.booking.rescheduled_from);
    await processEvents(db, tenant);
  });

  test("Off-peak flash deals / festival listings are published to the marketplace", async () => {
    const out = await runAgent(agent("deals"), ctx());
    const report = out.output as { occupancy: number; festival: string | null }[];
    assert.equal(report.length, 4, "looks 4 days ahead");
    const { count } = await db.from("deals").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).neq("kind", "last_minute");
    const eligible = report.some((d, i) => d.festival || ([1, 2, 3, 4].includes(toIst(istDate(addDays(today, i), "12:00")).dow) && d.occupancy < 35));
    assert.equal((count ?? 0) > 0, eligible);
  });
});

describe("Module 6 + loyalty — POS, split payouts, GST, memberships, wallet, points", () => {
  test("Checkout by booth renter: GST invoice, split payout, recipe consumption, loyalty & review request", async () => {
    const r = await createBooking(db, tenant, { client_id: ids.priya, service_id: ids.haircut, date: tomorrow, time: "13:00", staff_id: ids.ravi, source: "walkin" });
    await db.from("bookings").update({ status: "completed", rating: 5 }).eq("id", r.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r.booking.id, payment_method: "card", products: [{ product_id: ids.serum, qty: 1 }] }, "test");
    await processEvents(db, tenant);
    const { data: inv } = await db.from("invoices").select("*").eq("booking_id", r.booking.id).single();
    assert.ok(inv, "invoice issued");
    assert.equal(Number(inv!.igst), 0); assert.equal(Number(inv!.cgst), Number(inv!.sgst));
    assert.equal(Number(inv!.cgst) + Number(inv!.sgst), Math.round(Number(inv!.taxable_value) * 0.18 * 100) / 100);
    assert.match(inv!.number, /^ITSA\/\d{4}-\d{2}\/\d{4}$/);
    assert.ok(inv!.irn && inv!.irn.length === 64);
    assert.ok(inv!.splits.booth_renter.amount > 0 && inv!.splits.gateway_fee > 0, "booth renter share + card fee");
    const { data: c } = await db.from("clients").select("loyalty_points").eq("id", ids.priya).single();
    assert.equal(c!.loyalty_points, Math.floor(Number(inv!.total) / 100));
    const { data: rev } = await db.from("messages").select("body, meta").eq("client_id", ids.priya).eq("agent", "reputation");
    assert.ok(rev!.some((m) => m.meta.kind === "review_request" && m.body.includes("g.page")));
  });

  test("Membership discount + points redemption reduce taxable value; wallet pays first", async () => {
    const plan = await ins<{ id: string }>("membership_plans", { name: "Gold", price: 3000, discount_pct: 20, validity_days: 365, wallet_credit: 0 });
    await ins("client_memberships", { client_id: ids.priya, plan_id: plan.id, ends_at: addDays(today, 365) });
    await db.from("clients").update({ wallet_balance: 200 }).eq("id", ids.priya);
    const before = (await db.from("clients").select("loyalty_points").eq("id", ids.priya).single()).data!.loyalty_points;
    const r = await createBooking(db, tenant, { client_id: ids.priya, service_id: ids.facial, date: tomorrow, time: "16:00", source: "walkin" });
    await db.from("bookings").update({ status: "completed" }).eq("id", r.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r.booking.id, payment_method: "upi", redeem_points: true, use_wallet: true }, "test");
    await processEvents(db, tenant);
    const { data: inv } = await db.from("invoices").select("*").eq("booking_id", r.booking.id).single();
    const expectedTaxable = Math.round((Number(r.booking.price) * 0.8 - before) * 100) / 100;
    assert.equal(Number(inv!.taxable_value), expectedTaxable);
    assert.equal(inv!.splits.points_redeemed, before);
    assert.equal(inv!.splits.wallet_used, 200);
    const { data: c } = await db.from("clients").select("wallet_balance").eq("id", ids.priya).single();
    assert.equal(Number(c!.wallet_balance), 0);
  });

  test("Gift card: no GST at sale, code delivered on WhatsApp, redeemed at checkout after tax (taxable value unchanged)", async () => {
    const d = addDays(today, 3);
    const meera = await findOrCreateClient(db, tenant.id, { name: "Meera", phone: "+919811100031", language: "en" });
    ids.meera = meera.id;
    const invBefore = (await db.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id)).count;
    const g = await sellGiftCard(db, tenant, { amount: 400, buyer_name: "Priya", recipient_name: "Meera", recipient_phone: "+919811100031", message: "Happy birthday", payment_method: "upi" });
    assert.match(g.code, /^GC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await processEvents(db, tenant);
    assert.equal((await db.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id)).count, invBefore, "no invoice for a voucher");
    const { data: sent } = await db.from("messages").select("body, contact_handle, meta").eq("tenant_id", tenant.id).eq("agent", "prepaid").contains("meta", { gift_card_id: g.id });
    assert.equal(sent!.length, 1); assert.ok(sent![0].body.includes(g.code), "code appended verbatim"); assert.equal(sent![0].contact_handle, "+919811100031");
    await assert.rejects(findUsableGiftCard(db, tenant.id, "GC-ZZZZ-ZZZZ"), /not found/);

    const r = await createBooking(db, tenant, { client_id: meera.id, service_id: ids.haircut, date: d, time: "11:00", source: "walkin" });
    await db.from("bookings").update({ status: "completed" }).eq("id", r.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r.booking.id, payment_method: "upi", gift_card_code: g.code.toLowerCase().replace(/-/g, " ") }, "test");
    await processEvents(db, tenant);
    const { data: inv } = await db.from("invoices").select("*").eq("booking_id", r.booking.id).single();
    assert.equal(Number(inv!.taxable_value), Number(r.booking.price), "a voucher is a payment, not a discount");
    const used = Math.min(400, Number(inv!.total));
    assert.equal(Number(inv!.splits.gift_card_used), used);
    assert.equal(inv!.splits.gift_card_code, g.code);
    assert.equal(Number(inv!.splits.collected_now), Math.round((Number(inv!.total) - used) * 100) / 100);
    const { data: card } = await db.from("gift_cards").select("balance, status").eq("id", g.id).single();
    assert.equal(Number(card!.balance), Math.round((400 - used) * 100) / 100);
    assert.equal(card!.status, 400 - used <= 0 ? "redeemed" : "active");
  });

  test("Prepaid package: GST invoiced at sale; each visit uses one session at ₹0, earliest-expiring first", async () => {
    const d = addDays(today, 3);
    const plan = await ins<{ id: string }>("package_plans", { name: "3 haircuts", service_id: ids.haircut, sessions: 3, price: 1200, validity_days: 90 });
    const sold = await sellPackage(db, tenant, { client_id: ids.meera, plan_id: plan.id, payment_method: "upi" });
    assert.equal(Number(sold.invoice.inv.taxable_value), 1200);
    assert.equal(Number(sold.invoice.inv.total), Math.round(1200 * (1 + tenant.settings.gst_rate / 100) * 100) / 100, "GST charged on the package up front");
    ids.pkg = sold.package_id;
    const r = await createBooking(db, tenant, { client_id: ids.meera, service_id: ids.haircut, date: d, time: "13:00", source: "walkin" });
    await db.from("bookings").update({ status: "completed" }).eq("id", r.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r.booking.id, payment_method: "cash", use_package: true }, "test");
    await processEvents(db, tenant);
    const { data: inv } = await db.from("invoices").select("*").eq("booking_id", r.booking.id).single();
    assert.equal(Number(inv!.taxable_value), 0, "the service was already paid and taxed");
    assert.equal(Number(inv!.total), 0);
    assert.equal(inv!.splits.package_session, "3 haircuts 1/3");
    const { data: cp } = await db.from("client_packages").select("sessions_left").eq("id", sold.package_id).single();
    assert.equal(cp!.sessions_left, 2);
    // opting out bills normally and leaves the package untouched
    const r2 = await createBooking(db, tenant, { client_id: ids.meera, service_id: ids.haircut, date: d, time: "15:00", source: "walkin" });
    await db.from("bookings").update({ status: "completed" }).eq("id", r2.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r2.booking.id, payment_method: "cash", use_package: false }, "test");
    await processEvents(db, tenant);
    const { data: inv2 } = await db.from("invoices").select("taxable_value").eq("booking_id", r2.booking.id).single();
    assert.equal(Number(inv2!.taxable_value), Number(r2.booking.price));
    assert.equal((await db.from("client_packages").select("sessions_left").eq("id", sold.package_id).single()).data!.sessions_left, 2);
  });

  test("Prepaid Value Agent: expiry reminders once per stage, expired cards marked; manage token identifies one booking", async () => {
    const soonCard = await sellGiftCard(db, tenant, { amount: 300, buyer_name: "Priya", buyer_phone: "+919811100001", validity_days: 10 });
    const oldCard = await ins<{ id: string }>("gift_cards", { code: "GC-OLDC-ARD2", amount: 100, balance: 100, expires_at: addDays(today, -1) });
    await db.from("client_packages").update({ expires_at: addDays(today, 2) }).eq("id", ids.pkg);
    await processEvents(db, tenant); // delivery of the new card
    const def = agent("prepaid");
    const out = await runAgent(def, ctx());
    assert.match(out.summary, /2 expiry reminder/);
    const { data: msgs } = await db.from("messages").select("body, meta").eq("tenant_id", tenant.id).eq("agent", "prepaid").eq("meta->>kind", "expiry");
    assert.ok(msgs!.some((m) => m.meta.gift_card_id === soonCard.id && m.meta.stage === "first" && m.body.includes(soonCard.code)));
    assert.ok(msgs!.some((m) => m.meta.package_id === ids.pkg && m.meta.stage === "last" && /2 session/.test(m.body)));
    assert.equal((await db.from("gift_cards").select("status").eq("id", oldCard.id).single()).data!.status, "expired");
    const again = await runAgent(def, ctx());
    assert.equal(again.skipLog, true, "no duplicate reminders");

    const r = await createBooking(db, tenant, { client_id: ids.meera, service_id: ids.facial, date: addDays(today, 4), time: "12:00", source: "marketplace" });
    assert.match(String(r.booking.manage_token), /^[0-9a-f-]{36}$/);
    const { data: byToken } = await db.from("bookings").select("id").eq("manage_token", r.booking.manage_token);
    assert.deepEqual(byToken!.map((b) => b.id), [r.booking.id]);
  });

  test("Consultation & Safety Agent: colour booking without a patch test → client asked to test 48 h before; reacted test → owner warned", async () => {
    await db.from("tenants").update({ phone: "+919811100099" }).eq("id", tenant.id); await refresh();
    const kavya = await findOrCreateClient(db, tenant.id, { name: "Kavya", phone: "+919811100041", language: "en" });
    const d = addDays(today, 5);
    const r = await createBooking(db, tenant, { client_id: kavya.id, service_id: ids.balayage, date: d, time: "11:00", source: "walkin" });
    await processEvents(db, tenant);
    const { data: ask } = await db.from("messages").select("body, meta").eq("tenant_id", tenant.id).eq("agent", "consultation").contains("meta", { booking_id: r.booking.id });
    assert.equal(ask!.length, 1); assert.equal(ask![0].meta.kind, "patch_test_request");
    assert.equal(ask![0].meta.by, addDays(d, -2), "test due 48 h before the appointment");
    // the test reacted → the salon is warned, the client is not asked again
    await ins("patch_tests", { client_id: kavya.id, product: "Majirel 7.1", tested_on: today, result: "fail" });
    const r2 = await createBooking(db, tenant, { client_id: kavya.id, service_id: ids.balayage, date: d, time: "15:00", source: "walkin" });
    await processEvents(db, tenant);
    const { data: warn } = await db.from("messages").select("body, contact_handle, meta").eq("tenant_id", tenant.id).eq("agent", "consultation").contains("meta", { booking_id: r2.booking.id });
    assert.equal(warn!.length, 1); assert.equal(warn![0].meta.kind, "patch_test_failed"); assert.equal(warn![0].contact_handle, "+919811100099");
    // a passed test 3 days before → nothing to do; a haircut never needs one
    const ok = await findOrCreateClient(db, tenant.id, { name: "Tara", phone: "+919811100042" });
    await ins("patch_tests", { client_id: ok.id, product: "Majirel 7.1", tested_on: addDays(today, -3), result: "pass" });
    const r3 = await createBooking(db, tenant, { client_id: ok.id, service_id: ids.balayage, date: addDays(today, 6), time: "11:00", source: "walkin" });
    const r4 = await createBooking(db, tenant, { client_id: ok.id, service_id: ids.haircut, date: addDays(today, 6), time: "16:00", source: "walkin" });
    await processEvents(db, tenant);
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("agent", "consultation").in("meta->>booking_id", [r3.booking.id, r4.booking.id]);
    assert.equal(count, 0);
    // DPDP: erasing a client removes their consultation records
    await db.from("patch_tests").delete().eq("client_id", kavya.id);
    assert.equal((await db.from("patch_tests").select("id", { count: "exact", head: true }).eq("client_id", kavya.id)).count, 0);
  });

  test("Attendance feeds payroll: loss of pay for absent days, approved leave not deducted; one clock-in per day", async () => {
    const st = await ins<{ id: string }>("staff", { name: "Pooja", skill_level: 2, skills: ["skin"], base_salary: 30000, hourly_cost: 150 });
    await clockIn(db, tenant.id, st.id);
    await assert.rejects(clockIn(db, tenant.id, st.id), /Already clocked in/);
    await clockOut(db, tenant.id, st.id);
    await assert.rejects(clockOut(db, tenant.id, st.id), /Not clocked in/);
    // previous month: present on 20 days, 2 days approved leave, the rest absent
    const pm = addDays(`${today.slice(0, 8)}01`, -1).slice(0, 7);
    const days = new Date(Date.UTC(Number(pm.slice(0, 4)), Number(pm.slice(5, 7)), 0)).getUTCDate();
    const from = `${pm}-01`, to = `${pm}-${String(days).padStart(2, "0")}`;
    const rows = Array.from({ length: 20 }, (_, i) => { const dd = `${pm}-${String(i + 1).padStart(2, "0")}`; return { tenant_id: tenant.id, staff_id: st.id, work_date: dd, clock_in: istDate(dd, "10:00").toISOString(), clock_out: istDate(dd, "19:00").toISOString() }; });
    assert.ifError((await db.from("staff_attendance").insert(rows)).error);
    await ins("staff_time_off", { staff_id: st.id, start_at: istDate(`${pm}-21`, "00:00").toISOString(), end_at: istDate(`${pm}-22`, "23:59").toISOString(), reason: "leave" });
    const p = await computePayroll(db, tenant.id, from, to);
    const line = p.lines.find((l) => l.staff_id === st.id)! as { base: number; attendance: { present: number; absent: number; lop: number; leave: number } };
    const absent = days - 20 - 2;
    assert.equal(line.attendance.present, 20);
    assert.equal(line.attendance.absent, absent);
    assert.equal(line.attendance.lop, Math.round((30000 / days) * absent));
    assert.equal(line.base, 30000 - line.attendance.lop);
    // a stylist who never clocks in is never docked
    const neha = p.lines.find((l) => l.staff_id === ids.neha)! as { attendance: unknown; base: number };
    assert.equal(neha.attendance, null); assert.equal(neha.base, 12000);
    await db.from("staff").update({ active: false }).eq("id", st.id); // keep the team the other suites expect
  });

  test("Profit & loss: revenue net of GST, stock at cost, payroll and expenses add up", async () => {
    const month = today.slice(0, 7);
    const before = await monthlyPnl(db, tenant, month);
    await ins("expenses", { spent_on: today, category: "rent", amount: 15000, gst_paid: 0 });
    await ins("expenses", { spent_on: today, category: "utilities", amount: 2400 });
    const p = await monthlyPnl(db, tenant, month);
    const { data: inv } = await db.from("invoices").select("taxable_value").eq("tenant_id", tenant.id).gte("invoice_date", `${month}-01`).lte("invoice_date", today);
    assert.equal(p.revenue, Math.round(inv!.reduce((s, i) => s + Number(i.taxable_value), 0) * 100) / 100);
    assert.equal(p.expenses - before.expenses, 17400);
    assert.equal(p.net, Math.round((p.revenue - p.productCost - p.payroll - p.expenses) * 100) / 100);
    assert.ok(p.productCost > 0, "retail serum + back-bar lightener are costed");
    assert.equal(p.expensesByCategory[0].category, "rent");
  });

  test("Referral bonus credited to referrer after friend's first visit", async () => {
    const friend = await ins<{ id: string }>("clients", { name: "Friend", phone: "+919811100004", referred_by: ids.priya });
    const pts0 = (await db.from("clients").select("loyalty_points").eq("id", ids.priya).single()).data!.loyalty_points;
    const r = await createBooking(db, tenant, { client_id: friend.id, service_id: ids.haircut, date: tomorrow, time: "17:00", source: "walkin" });
    await db.from("bookings").update({ status: "completed" }).eq("id", r.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r.booking.id, payment_method: "upi" }, "test");
    await processEvents(db, tenant);
    const pts1 = (await db.from("clients").select("loyalty_points").eq("id", ids.priya).single()).data!.loyalty_points;
    assert.equal(pts1 - pts0, tenant.settings.referral_bonus_points);
  });

  test("Membership sale issues a GST invoice", async () => {
    const r = await issueInvoice(db, tenant, { client_id: ids.priya, method: "upi", lines: [{ description: "Membership: Gold", kind: "service", code: "999799", qty: 1, rate: 18, unit_price: 3000 }] });
    assert.equal(r.inv.total, 3540);
  });

  test("Low rating triggers service recovery", async () => {
    const c = await findOrCreateClient(db, tenant.id, { name: "Unhappy", phone: "+919811100005" });
    const r = await createBooking(db, tenant, { client_id: c.id, service_id: ids.haircut, date: tomorrow, time: "19:00", source: "walkin" });
    await db.from("bookings").update({ status: "completed", rating: 2, review: "rude staff, late" }).eq("id", r.booking.id);
    await emit(db, tenant.id, "booking.completed", { booking_id: r.booking.id, payment_method: "cash" }, "test");
    await processEvents(db, tenant);
    const { data } = await db.from("campaigns").select("type").eq("client_id", c.id);
    assert.ok(data!.some((x) => x.type === "service_recovery"));
  });
});

describe("Module 1 — procurement, negotiation, waste", () => {
  test("Predictive refill drafts a PO and the negotiator gets a discount", async () => {
    // checkouts above already emitted stock.check → the agent may have drafted the PO already; run it again either way
    await runAgent(agent("inventory"), ctx());
    await processEvents(db, tenant);
    const { data: po } = await db.from("purchase_orders").select("*").eq("tenant_id", tenant.id).eq("vendor_id", ids.vendorLocal).order("created_at", { ascending: false }).limit(1).single();
    assert.equal(po!.created_by, "agent:inventory");
    assert.match(po!.ai_reasoning, /days of stock left/);
    assert.match(po!.ai_reasoning, /Negotiated/);
    const { data: neg } = await db.from("negotiations").select("*").eq("po_id", po!.id).single();
    assert.ok(Number(neg!.negotiated_total) < Number(neg!.original_total));
    assert.equal(neg!.messages.length, 2);
    ids.po = po!.id;
  });

  test("Waste tracking flags over-use and the Performance Coach assigns training", async () => {
    const u = await ins("usage_logs", { product_id: ids.lightener, booking_id: ids.b1, staff_id: ids.asha, expected_qty: 40, actual_qty: 60, source: "scale" });
    await emit(db, tenant.id, "usage.logged", { usage_id: u.id }, "test");
    await processEvents(db, tenant);
    const { data: ul } = await db.from("usage_logs").select("flagged").eq("id", u.id).single();
    assert.equal(ul!.flagged, true);
    const { data: la } = await db.from("learning_assignments").select("module").eq("staff_id", ids.asha);
    assert.ok(la!.some((x) => /waste/i.test(x.module)));
  });

  test("ITC: inter-state PO received → GSTR-3B shows IGST credit", async () => {
    const po = await ins<{ id: string }>("purchase_orders", { vendor_id: ids.vendorOut, status: "received", is_interstate: true, items: [{ product_id: ids.serum, name: "Serum", qty: 10, unit_cost: 300, gst_rate: 18 }], subtotal: 3000, gst_amount: 540, total: 3540, received_at: new Date().toISOString() });
    assert.ok(po.id);
    await emit(db, tenant.id, "gst.prepare", { period: today.slice(0, 7) }, "test");
    await processEvents(db, tenant);
    const { data: g } = await db.from("gst_returns").select("*").eq("tenant_id", tenant.id).eq("period", today.slice(0, 7)).single();
    assert.equal(g!.gstr3b.itc_available.igst, 540);
    assert.ok(g!.gstr1.docs.count >= 3);
    assert.ok(g!.gstr1.hsn.some((h: { code: string }) => h.code === "999721"));
  });
});

describe("Module 2 — CRM, churn, unified inbox", () => {
  test("Autonomous campaign: 4-week client at week 5 gets a personalised offer", async () => {
    const c = await findOrCreateClient(db, tenant.id, { name: "Regular Rohan", phone: "+919811100006" });
    for (const d of [-92, -64, -36]) await logPastVisit(db, tenant, { client_id: c.id, service_id: ids.haircut, staff_id: ids.ravi, date: addDays(today, d) });
    await processEvents(db, tenant);
    const { data: cl } = await db.from("clients").select("avg_cycle_days").eq("id", c.id).single();
    assert.equal(cl!.avg_cycle_days, 28);
    await runAgent(agent("retention"), ctx());
    const { data } = await db.from("campaigns").select("type, message").eq("client_id", c.id);
    assert.ok(data!.some((x) => x.type === "retention" && x.message.includes("Rohan")));
    await assert.rejects(logPastVisit(db, tenant, { client_id: c.id, service_id: ids.haircut, date: tomorrow }), /before today/);
  });

  test("Churn: negative review + drifting frequency → at-risk → recovery offer", async () => {
    const c = await findOrCreateClient(db, tenant.id, { name: "Drifting Diya", phone: "+919811100007" });
    await logPastVisit(db, tenant, { client_id: c.id, service_id: ids.haircut, date: addDays(today, -106) });
    await logPastVisit(db, tenant, { client_id: c.id, service_id: ids.haircut, date: addDays(today, -78) });
    await logPastVisit(db, tenant, { client_id: c.id, service_id: ids.haircut, date: addDays(today, -50), rating: 1, review: "worst service, rude staff" });
    await processEvents(db, tenant);
    const { data: cl } = await db.from("clients").select("churn_risk").eq("id", c.id).single();
    assert.ok(cl!.churn_risk >= 0.6, `risk ${cl!.churn_risk}`);
    const { data } = await db.from("campaigns").select("type").eq("client_id", c.id);
    assert.ok(data!.some((x) => x.type === "churn_recovery"));
  });

  test("Birthday campaign", async () => {
    const c = await ins<{ id: string }>("clients", { name: "Birthday Bina", phone: "+919811100008", birthday: `1995-${addDays(today, 3).slice(5)}` });
    await runAgent(agent("retention"), ctx());
    const { data } = await db.from("campaigns").select("type").eq("client_id", c.id);
    assert.ok(data!.some((x) => x.type === "birthday"));
  });

  test("Unified inbox: every channel gets an AI reply; Hinglish WhatsApp request books", async () => {
    for (const [channel, handle, body] of [
      ["instagram", "@insta_meera", "How much is a classic facial?"], ["google", "google-user-1", "What are your timings?"],
      ["call", "+919811100009", "Caller asked: is men's haircut available tomorrow"], ["web", "+919811100010", "hello"],
      ["whatsapp", "+919811100011", "kal 10am men's haircut book kar do please"],
    ]) {
      await receiveMessage(db, tenant.id, { channel, handle, body });
      await processEvents(db, tenant);
      const { data } = await db.from("messages").select("body").eq("tenant_id", tenant.id).eq("contact_handle", handle).eq("direction", "out");
      assert.ok(data!.length >= 1, `${channel} got a reply`);
    }
    // two-phase: the AI only PROPOSED — nothing is booked until the customer says yes
    const q = () => db.from("bookings").select("start_at, source, clients!inner(phone)").eq("tenant_id", tenant.id).eq("clients.phone", "+919811100011");
    assert.equal((await q()).data!.length, 0, "no booking before explicit confirmation");
    const { data: prop } = await db.from("booking_proposals").select("status, time").eq("contact_handle", "+919811100011").single();
    assert.equal(prop!.status, "pending"); assert.equal(prop!.time.slice(0, 5), "10:00");
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: "+919811100011", body: "haan, confirm" });
    await processEvents(db, tenant);
    const bk = (await q()).data!;
    assert.equal(bk.length, 1); assert.equal(bk[0].source, "whatsapp"); assert.equal(toIst(new Date(bk[0].start_at)).time, "10:00");
    assert.equal((await db.from("booking_proposals").select("status").eq("contact_handle", "+919811100011").single()).data!.status, "confirmed");
    const { data: price } = await db.from("messages").select("body").eq("contact_handle", "@insta_meera").eq("direction", "out");
    assert.match(price![0].body, /900|facial/i);
  });
});

describe("Multilingual conversational AI (RFP §4) — rules engine, no API key", () => {
  test("A customer books entirely in Tamil: native-script proposal, 'ஆம்' confirms", async () => {
    const h = "+919811100020";
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: "நாளை 11 மணிக்கு ஃபேஷியல் புக் செய்ய வேண்டும்" });
    await processEvents(db, tenant);
    const outs = async () => (await db.from("messages").select("body").eq("tenant_id", tenant.id).eq("contact_handle", h).eq("direction", "out").order("created_at")).data!;
    const first = (await outs()).at(-1)!.body;
    assert.match(first, /உறுதிப்படுத்த/, `Tamil proposal expected, got: ${first}`);
    assert.match(first, /Classic facial/);
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: "ஆம்" });
    await processEvents(db, tenant);
    assert.match((await outs()).at(-1)!.body, /முன்பதிவு உறுதி/);
    const { data: bk } = await db.from("bookings").select("start_at, clients!inner(phone, language)").eq("tenant_id", tenant.id).eq("clients.phone", h);
    assert.equal(bk!.length, 1); assert.equal(toIst(new Date(bk![0].start_at)).time, "11:00");
  });

  test("Kannada and Urdu customers book end-to-end in their own script (13-language rules engine)", async () => {
    const outs = async (h: string) => (await db.from("messages").select("body").eq("tenant_id", tenant.id).eq("contact_handle", h).eq("direction", "out").order("created_at")).data!;
    for (const [h, ask, yes, proposalRe, confirmedRe, time] of [
      ["+919811100022", "ನಾಳೆ 12 ಗಂಟೆಗೆ ಫೇಶಿಯಲ್ ಬುಕ್ ಮಾಡಿ", "ಹೌದು", /ಖಚಿತಪಡಿಸಲು/, /ಬುಕಿಂಗ್ ಖಚಿತ/, "12:00"],
      ["+919811100023", "کل 2 بجے فیشل بک کرنا ہے", "ہاں", /تصدیق کے لیے/, /بکنگ پکی/, "14:00"],
    ] as const) {
      await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: ask });
      await processEvents(db, tenant);
      const first = (await outs(h)).at(-1)!.body;
      assert.match(first, proposalRe, `native-script proposal expected, got: ${first}`);
      assert.match(first, /Classic facial/);
      await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: yes });
      await processEvents(db, tenant);
      assert.match((await outs(h)).at(-1)!.body, confirmedRe);
      const { data: bk } = await db.from("bookings").select("start_at, clients!inner(phone)").eq("tenant_id", tenant.id).eq("clients.phone", h);
      assert.equal(bk!.length, 1, h); assert.equal(toIst(new Date(bk![0].start_at)).time, time);
    }
  });

  test("Hindi price question gets a Hindi answer from real catalogue data", async () => {
    const h = "+919811100021";
    await receiveMessage(db, tenant.id, { channel: "instagram", handle: h, body: "फेशियल कितने का है?" });
    await processEvents(db, tenant);
    const body = (await db.from("messages").select("body").eq("contact_handle", h).eq("direction", "out").single()).data!.body;
    assert.match(body, /Classic facial: ₹900 \(\+18% GST\), 60 मिनट/);
  });
});

describe("Human handoff (Kontor pattern)", () => {
  test("Complaint escalates to a human; AI stays silent until handed back", async () => {
    const h = "+919811100012";
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: "Worst experience, staff was rude. I want a refund" });
    await processEvents(db, tenant);
    const conv = (await db.from("conversations").select("status, reason").eq("tenant_id", tenant.id).eq("contact_handle", h).single()).data!;
    assert.equal(conv.status, "human"); assert.equal(conv.reason, "complaint");
    const outs = async () => (await db.from("messages").select("id").eq("contact_handle", h).eq("direction", "out")).data!.length;
    const n1 = await outs();
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: "hello??" });
    await processEvents(db, tenant);
    assert.equal(await outs(), n1, "AI did not reply while a human owns the thread");
    await db.from("conversations").update({ status: "ai" }).eq("tenant_id", tenant.id).eq("contact_handle", h);
    await receiveMessage(db, tenant.id, { channel: "whatsapp", handle: h, body: "hi" });
    await processEvents(db, tenant);
    assert.equal(await outs(), n1 + 1);
  });

  test("Two unclear messages in a row escalate", async () => {
    const h = "@confused_user";
    for (const body of ["asdf qwerty", "zzz ???"]) { await receiveMessage(db, tenant.id, { channel: "instagram", handle: h, body }); await processEvents(db, tenant); }
    assert.equal((await db.from("conversations").select("status").eq("tenant_id", tenant.id).eq("contact_handle", h).single()).data!.status, "human");
  });
});

describe("Ported from open source", () => {
  test("CSV client import (Fresha/Booksy-style export) with dedupe", async () => {
    const csv = "First Name,Last Name,Mobile Number,Email,Date of Birth\nAnita,Desai,9822001100,anita@x.in,02/03/1990\nPriya,Dup,+919811100001,,\nNo,Phone,,,\n";
    const r = await importClients(db, tenant.id, csv, false);
    assert.equal(r.imported, 2); assert.equal(r.duplicates, 1, "Priya's phone already exists");
    const { data } = await db.from("clients").select("name, birthday, consent_marketing").eq("tenant_id", tenant.id).eq("phone", "+919822001100").single();
    assert.equal(data!.name, "Anita Desai"); assert.equal(data!.birthday, "1990-03-02"); assert.equal(data!.consent_marketing, false);
    assert.equal((await importClients(db, tenant.id, csv, false)).imported, 1, "re-import only re-adds the phoneless row");
  });

  test("Stylist ICS feed (needs BASE_URL of a running app)", { skip: !process.env.BASE_URL }, async () => {
    const { data: st } = await db.from("staff").select("calendar_token").eq("id", ids.asha).single();
    assert.match(st!.calendar_token, /^[a-f0-9]{32}$/);
    const res = await fetch(`${process.env.BASE_URL}/api/ics/${st!.calendar_token}.ics`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /BEGIN:VCALENDAR/); assert.match(body, /SUMMARY:Balayage — Priya/);
    assert.equal((await fetch(`${process.env.BASE_URL}/api/ics/${"0".repeat(32)}.ics`)).status, 404);
  });
});

describe("Module 4 — recruitment, payroll, performance", () => {
  test("Job ads for Indian boards + resume screening + conversational interview", async () => {
    const job = await ins("job_postings", { title: "Senior Colourist", role: "colourist", description: "balayage colour certified weekends", salary_range: "₹30k–45k" });
    await emit(db, tenant.id, "job.created", { job_id: job.id }, "test");
    const cand = await ins("candidates", { job_id: job.id, name: "Meena", resume_text: "Colourist with 6 years experience, L'Oreal certified in balayage and global colour, works weekends" });
    await emit(db, tenant.id, "candidate.added", { candidate_id: cand.id }, "test");
    await processEvents(db, tenant);
    const { data: j } = await db.from("job_postings").select("ad_copy").eq("id", job.id).single();
    for (const k of ["naukri", "apna", "instagram", "whatsapp"]) assert.ok(j!.ad_copy[k]);
    const { data: c } = await db.from("candidates").select("score, status, screening_chat").eq("id", cand.id).single();
    assert.ok(c!.score >= 70 && c!.status === "shortlisted", `score ${c!.score}`);
    await screeningTurn(db, tenant, cand.id, "6 years at Lakme and Toni&Guy");
    const { data: c2 } = await db.from("candidates").select("screening_chat").eq("id", cand.id).single();
    assert.equal(c2!.screening_chat.length, 3);
  });

  test("Payroll: slabs, product commission, tips, penalties, booth-renter share", async () => {
    await ins("staff_adjustments", { staff_id: ids.ravi, kind: "tip", amount: 100 });
    await ins("staff_adjustments", { staff_id: ids.neha, kind: "penalty", amount: 500 });
    const p = await computePayroll(db, tenant.id, addDays(today, -1), addDays(today, 2));
    const ravi = p.lines.find((l) => l.staff_id === ids.ravi)!;
    assert.equal(ravi.type, "booth_renter");
    assert.ok(ravi.booth_payout > 0 && ravi.tips === 100 && ravi.product_revenue > 0);
    const neha = p.lines.find((l) => l.staff_id === ids.neha)!;
    // Maharashtra employee on ₹12,000: PF 12% = 1440, ESI 0.75% = 90, PT (MH, >₹10k) = 200 (300 in Feb)
    const pt = Number(addDays(today, 2).slice(5, 7)) === 2 ? 300 : 200;
    assert.deepEqual([neha.statutory!.pf_employee, neha.statutory!.esi_employee, neha.statutory!.pt], [1440, 90, pt]);
    assert.equal(neha.net, 12000 - 500 - 1440 - 90 - pt);
    assert.equal(neha.employer_cost, 12000 + 1440 + Math.ceil(12000 * 0.0325));
    assert.equal(ravi.statutory, null, "booth renters are not employees");
  });

  test("Performance coach reviews utilisation and ratings", async () => {
    const out = await runAgent(agent("performance"), ctx());
    assert.ok((out.output as unknown[]).length === 3);
  });
});

describe("Module 5 — marketplace", () => {
  test("Intent search: RFP-style query finds the salon with live slots under budget", async () => {
    const r = await searchMarketplace(db, `balayage under ₹4000 in Pune available tomorrow evening`);
    assert.equal(r.intent.maxPrice, 4000);
    assert.equal(r.intent.city, "Pune");
    const hit = r.results.find((x) => x.tenant.id === tenant.id);
    assert.ok(hit, "salon found");
    assert.equal(hit!.service.id, ids.balayage);
    assert.ok(hit!.slots.every((s) => s.time >= "17:00" && s.price <= 4000));
  });

  test("Public (anon) can read live deals and services but not bookings or clients", async () => {
    const anon = mk();
    const { data: deals } = await anon.from("deals").select("id").eq("tenant_id", tenant.id);
    assert.ok(deals!.length >= 1);
    const { data: svc } = await anon.from("services").select("id").eq("tenant_id", tenant.id);
    assert.equal(svc!.length, 3);
    const { data: bk } = await anon.from("bookings").select("id").eq("tenant_id", tenant.id);
    assert.equal(bk!.length, 0);
    const { data: cl } = await anon.from("clients").select("id").eq("tenant_id", tenant.id);
    assert.equal(cl!.length, 0);
  });
});

describe("Indic translation (free providers) + Translator Agent", () => {
  const reachable = async () => fetch("https://api.mymemory.translated.net/get?q=hello&langpair=en|hi", { signal: AbortSignal.timeout(8000) }).then((r) => r.ok).catch(() => false);

  test("Gateway translates English → Tamil and Kannada → English with no API key; phone numbers never leave the server", async (t) => {
    if (!(await reachable())) return t.skip("MyMemory public API not reachable from this network");
    const realFetch = globalThis.fetch;
    const sent: string[] = [];
    globalThis.fetch = ((u: RequestInfo | URL, i?: RequestInit) => { sent.push(decodeURIComponent(String(u))); return realFetch(u, i); }) as typeof fetch;
    try {
      const ta = await translate("Your facial is confirmed for tomorrow. Call us on +919811100099 if you are late.", "ta");
      assert.match(ta.text, /[\u0B80-\u0BFF]/, `Tamil script expected, got: ${ta.text}`);
      assert.match(ta.text, /\+919811100099/, "the phone number is restored in the translated text");
      assert.ok(sent.length > 0 && sent.every((u) => !u.includes("9811100099")), "…but was masked in every outbound request");
      const en = await translate("ನಾಳೆ ಸಂಜೆ ಹೇರ್ ಕಟ್ ಬೇಕು", "en");
      assert.match(en.text, /hair|cut/i, en.text);
      assert.equal((await translate("Hello", "en")).provider, "same-language");
    } finally { globalThis.fetch = realFetch; }
  });

  test("Translator Agent stores the catalogue in Indian languages; consumers read it, private inbox translations stay private", async (t) => {
    if (!(await reachable())) return t.skip("MyMemory public API not reachable from this network");
    const out = await runAgent(AGENTS.find((a) => a.id === "translator")!, { db, tenant, trigger: "manual" });
    assert.match(out.summary, /Translated \d+ catalogue text/, out.summary);
    const { data: rows } = await db.from("translations").select("lang, source_text, text, provider, is_public").eq("tenant_id", tenant.id);
    const hi = rows!.find((r) => r.lang === "hi" && r.source_text === "Classic facial");
    assert.ok(hi && /[\u0900-\u097F]/.test(hi.text), `Hindi translation of the service name expected: ${JSON.stringify(hi)}`);
    assert.ok(new Set(rows!.map((r) => r.lang)).size >= 3, "several languages per run");
    const L = await loadTranslations(mk(), [tenant.id], "hi"); // anonymous visitor
    assert.equal(L("Classic facial"), hi.text);
    assert.equal(L("something never translated"), "something never translated");
    // a cached inbox translation (private) must not be readable by the public
    await db.from("translations").insert({ tenant_id: tenant.id, lang: "en", source_hash: sourceHash("रहस्य संदेश"), source_text: "रहस्य संदेश", text: "secret message", provider: "test", is_public: false });
    const { data: leaked } = await mk().from("translations").select("id").eq("tenant_id", tenant.id).eq("is_public", false);
    assert.equal(leaked!.length, 0);
    // a second run only fills what is still missing: nothing is translated or stored twice
    await runAgent(AGENTS.find((a) => a.id === "translator")!, { db, tenant, trigger: "manual" });
    const { data: after } = await db.from("translations").select("id, created_at, lang, source_hash").eq("tenant_id", tenant.id).eq("is_public", true);
    assert.equal(new Set(after!.map((r) => `${r.lang}:${r.source_hash}`)).size, after!.length, "one row per text per language");
    assert.ok(after!.length >= rows!.filter((r) => r.is_public).length);
  });
});

describe("Voice Agent — hands-free navigation, form filling and answers", () => {
  const page = {
    path: "/app/clients", forms: [{ index: 0, title: "Add client" }, { index: 1, title: "Delete my account", danger: true }],
    fields: [{ form: 0, name: "name", label: "Name", type: "text" }, { form: 0, name: "phone", label: "Phone (WhatsApp)", type: "tel" }, { form: 1, name: "confirm", label: "Type DELETE", type: "text" }],
    buttons: ["Add client", "Delete account"],
  };
  test("A spoken sentence becomes safe UI actions; questions are answered from live data; every command is logged without its content", async () => {
    const fill = await interpretVoice({ db, tenant, text: "name Kavya Rao phone 98111 00088 and save", ctx: page, allowLlm: true });
    assert.deepEqual(fill.actions, [{ type: "fill", form: 0, name: "name", value: "Kavya Rao" }, { type: "fill", form: 0, name: "phone", value: "9811100088" }, { type: "submit", form: -1 }]);
    const nav = await interpretVoice({ db, tenant, text: "बुकिंग खोलो", lang: "hi", ctx: page, allowLlm: true });
    assert.deepEqual(nav.actions, [{ type: "navigate", path: "/app/bookings" }]);
    const q = await interpretVoice({ db, tenant, text: "how many bookings today?", ctx: page, allowLlm: true });
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).gte("start_at", istDate(today, "00:00").toISOString()).lt("start_at", istDate(tomorrow, "00:00").toISOString()).neq("status", "cancelled");
    assert.match(q.say, new RegExp(`^${count} booking`), q.say);
    assert.equal(q.actions.length, 0);
    const bad = await interpretVoice({ db, tenant, text: "click delete account", ctx: page, allowLlm: true });
    assert.equal(bad.actions.length, 0, "nothing destructive is ever returned");
    const { data: runs } = await db.from("agent_runs").select("summary, actions").eq("tenant_id", tenant.id).eq("agent", "voice").eq("trigger", "voice");
    assert.ok(runs!.length >= 4);
    assert.ok(!JSON.stringify(runs).includes("Kavya") && !JSON.stringify(runs).includes("9811100088"), "what was said (names, numbers) is not stored in the run log");
    const report = await runAgent(AGENTS.find((a) => a.id === "voice")!, { db, tenant, trigger: "manual" });
    assert.match(report.summary, /voice command\(s\) in the last 7 days/);
  });
});

describe("Voice replies in Indian languages", () => {
  test("A Hindi voice question is answered in Hindi; client and service names never reach the translation provider", async (t) => {
    const ok = await fetch("https://api.mymemory.translated.net/get?q=hello&langpair=en|hi", { signal: AbortSignal.timeout(8000) }).then((r) => r.ok).catch(() => false);
    if (!ok) return t.skip("MyMemory public API not reachable from this network");
    const realFetch = globalThis.fetch;
    const sent: string[] = [];
    globalThis.fetch = ((u: RequestInfo | URL, i?: RequestInit) => { sent.push(decodeURIComponent(String(u))); return realFetch(u, i); }) as typeof fetch;
    try {
      const r = await translateKeeping("Next is Meera Iyer for Classic facial at 6 pm.", "hi", ["Meera Iyer", "Classic facial"]);
      assert.ok(r, "a provider answered");
      assert.match(r!.text, /[\u0900-\u097F]/, r!.text);
      assert.match(r!.text, /Meera Iyer/); assert.match(r!.text, /Classic facial/);
      assert.ok(sent.length && sent.every((u) => !u.includes("Meera") && !u.includes("Classic facial")), "names were masked in every outbound request");
      const v = await interpretVoice({ db, tenant, text: "how many bookings today?", lang: "hi", ctx: { path: "/app", forms: [], fields: [], buttons: [] }, allowLlm: true });
      assert.match(v.say, /[\u0900-\u097F]/, `Hindi reply expected: ${v.say}`);
    } finally { globalThis.fetch = realFetch; }
  });
});

describe("Front desk — walk-in token queue, day-end closing, daily owner briefing", () => {
  test("Walk-ins get sequential tokens and wait estimates; calling one books it through the scheduler; names stay private", async () => {
    const a = await joinQueue(db, tenant, { name: "Walk-in One", phone: "+919811100091", service_id: ids.haircut, source: "desk" });
    const b = await joinQueue(db, tenant, { name: "Walk-in Two", phone: "+919811100092", service_id: ids.facial, source: "qr" });
    const c = await joinQueue(db, tenant, { name: "Walk-in Three", service_id: ids.haircut, source: "desk" });
    assert.deepEqual([b.token_no - a.token_no, c.token_no - b.token_no], [1, 1]);
    assert.equal((await joinQueue(db, tenant, { name: "Walk-in One again", phone: "+919811100091", service_id: ids.haircut, source: "qr" })).token_no, a.token_no, "same phone keeps its token");
    let q = await queueState(db, tenant);
    assert.deepEqual(q.waiting.map((w) => w.eta.position), [1, 2, 3]);
    const waits = q.waiting.map((w) => w.eta.waitMin);
    assert.ok(waits.every((w, i) => w === null || i === 0 || waits[i - 1] === null || w >= waits[i - 1]! - 60), `waits are plausible: ${waits}`);
    await leaveQueue(db, tenant, c.id);
    const nowMin = toIst(new Date()).minutes;
    // Seating depends on the clock: inside working hours the token becomes a booking, otherwise it is refused.
    const r = await callWalkin(db, tenant, a.id).catch((e: Error) => e);
    if (!(r instanceof Error)) {
      assert.equal(r.token_no, a.token_no);
      const { data: bk } = await db.from("bookings").select("source, status, clients!inner(phone)").eq("tenant_id", tenant.id).eq("clients.phone", "+919811100091").eq("source", "walkin");
      assert.equal(bk!.length, 1, "the called token is a normal booking (billing, stock and loyalty follow)");
      await processEvents(db, tenant);
      q = await queueState(db, tenant);
      assert.equal(q.nowServing, a.token_no); assert.deepEqual(q.waiting.map((w) => w.token_no), [b.token_no]);
    } else {
      assert.match(r.message, /free|closed|rest of today/, "outside working hours nobody can be seated");
      assert.ok(nowMin < 10 * 60 || nowMin > 20 * 60 - 60, `seating was refused during working hours: ${r.message}`);
      assert.equal((await db.from("bookings").select("id, clients!inner(phone)").eq("tenant_id", tenant.id).eq("clients.phone", "+919811100091").eq("source", "walkin")).data!.length, 0, "no booking in the past");
      q = await queueState(db, tenant);
      assert.equal(q.waiting.length, 2);
    }
    assert.equal((await mk().from("walkins").select("id").eq("tenant_id", tenant.id)).data!.length, 0, "the public cannot read who is waiting");
  });

  test("Day-end closing adds up the real invoices of the day", async () => {
    const { data: inv } = await db.from("invoices").select("total, taxable_value, cgst, sgst, igst, payment_method, items, splits").eq("tenant_id", tenant.id).eq("invoice_date", today);
    const d = summariseDay(inv as never);
    assert.equal(d.invoices, inv!.length);
    assert.ok(Math.abs(d.total - inv!.reduce((s, i) => s + Number(i.total), 0)) < 0.01);
    assert.ok(Math.abs(d.methods.reduce((s, m) => s + m.total, 0) - d.total) < 0.01, "payment modes add up to the total");
    assert.ok(Math.abs(d.taxable + d.gst - d.total) < 1, "taxable + GST = collected");
  });

  test("Daily Briefing Agent messages the owner once a day with figures from the database", async () => {
    await db.from("tenants").update({ phone: "+919811100000" }).eq("id", tenant.id);
    await refresh();
    const out = await runAgent(agent("briefing"), { db, tenant, trigger: "manual" });
    assert.match(out.summary, /briefing sent/i);
    const msgs = async () => (await db.from("messages").select("body").eq("tenant_id", tenant.id).eq("agent", "briefing")).data!;
    const first = await msgs();
    assert.equal(first.length, 1);
    assert.match(first[0].body, /\d+ bookings? today/); assert.match(first[0].body, /Revenue today is ₹/);
    await runAgent(agent("briefing"), { db, tenant, trigger: "schedule" });
    assert.equal((await msgs()).length, 1, "not sent twice on the same day (and never before 8 am)");
  });
});

describe("Security — append-only audit trail (migration 0007)", () => {
  test("Changes to sensitive tables are logged with actor and changed columns, never values; history cannot be edited", async () => {
    const { data: c } = await db.from("clients").insert({ tenant_id: tenant.id, name: "Audit Probe", phone: "+919811100077" }).select("id").single();
    await db.from("clients").update({ notes: "allergic to ammonia" }).eq("id", c!.id);
    const { data: log } = await db.from("audit_log").select("*").eq("tenant_id", tenant.id).eq("row_id", c!.id).order("id");
    // (the live scheduler may also touch this client — e.g. churn scoring — so look for our two changes rather than an exact list)
    assert.equal(`${log![0].table_name}:${log![0].op}`, "clients:insert");
    assert.equal(log![0].actor_type, "agent"); // the test connects as the platform-agent service account
    assert.ok(log!.some((l) => l.op === "update" && JSON.stringify(l.changed_fields) === '["notes"]'), JSON.stringify(log));
    assert.ok(!JSON.stringify(log).includes("ammonia"), "values are never stored in the audit log");
    await db.from("audit_log").delete().eq("tenant_id", tenant.id);
    await db.from("audit_log").update({ op: "tampered" }).eq("tenant_id", tenant.id);
    const { data: after } = await db.from("audit_log").select("op").eq("row_id", c!.id);
    assert.ok(after!.length >= log!.length && after!.every((l) => l.op !== "tampered"), "audit rows cannot be deleted or rewritten");
    assert.equal((await mk().from("audit_log").select("id").eq("tenant_id", tenant.id)).data!.length, 0, "not public");
  });
});

describe("Platform — orchestrator, self-optimizer, generative UI, multi-tenancy", () => {
  test("Orchestrator tick runs every periodic agent and drains the bus", async () => {
    const r = await tick(db, tenant);
    assert.equal(r.results.length, AGENTS.filter((a) => a.periodic).length);
    const { count } = await db.from("agent_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("status", "pending");
    assert.equal(count, 0);
  });

  test("Self-optimizer tightens deposit threshold when no-shows are high", async () => {
    for (const d of [-5, -4, -3]) await ins("bookings", { client_id: ids.flaky, service_id: ids.haircut, start_at: istDate(addDays(today, d), "12:00").toISOString(), end_at: istDate(addDays(today, d), "12:45").toISOString(), status: "no_show", price: 500, is_historical: true });
    const before = tenant.settings.deposit_threshold;
    await runAgent(agent("optimizer"), ctx());
    await refresh();
    assert.ok(tenant.settings.deposit_threshold < before, `${tenant.settings.deposit_threshold} < ${before}`);
  });

  test("Workflow designer: plain-language instruction pauses agents and tunes parameters", async () => {
    const r = await configureWorkflow(db, tenant, "Turn off the waitlist agent and ask for a 40% deposit; also try to disable billing");
    await refresh();
    assert.ok(tenant.settings.agents_disabled.includes("waitlist"));
    assert.ok(!tenant.settings.agents_disabled.includes("billing"), "billing is protected");
    assert.equal(tenant.settings.deposit_pct, 40);
    assert.ok(r.plan.notes.some((n) => /billing stays on/.test(n)));
    // paused agent no longer reacts to its event
    const c = await findOrCreateClient(db, tenant.id, { name: "Paused Pooja", phone: "+919811100030" });
    await ins("waitlist", { client_id: c.id, service_id: ids.haircut, date: addDays(today, 2) });
    const b = await createBooking(db, tenant, { client_id: ids.priya, service_id: ids.haircut, date: addDays(today, 2), time: "12:00", source: "walkin" });
    await db.from("bookings").update({ status: "cancelled" }).eq("id", b.booking.id);
    await emit(db, tenant.id, "booking.cancelled", { booking_id: b.booking.id }, "test");
    await processEvents(db, tenant);
    assert.equal((await db.from("waitlist").select("status").eq("client_id", c.id).single()).data!.status, "waiting", "paused waitlist agent made no offer");
    await configureWorkflow(db, tenant, "turn the waitlist back on");
    await refresh();
    assert.ok(!tenant.settings.agents_disabled.includes("waitlist"));
  });

  test("Generative micro-frontend only uses registry widgets", async () => {
    const r = await generateLayout(db, tenant, "show revenue, low stock and at risk clients", "hi");
    assert.ok(r.widgets.length >= 1);
    assert.ok(r.widgets.every((w) => ["revenue_today", "revenue_30d", "bookings_today", "no_show_rate", "at_risk_clients", "low_stock", "upcoming_bookings", "active_deals", "pending_pos", "revenue_by_service", "staff_revenue", "gst_month", "agent_actions"].includes(w.dataset)));
  });

  test("Tenant isolation: two owners cannot see or write each other's data; owners can delete themselves", async () => {
    const users = [] as SupabaseClient[];
    for (const who of ["a", "b"]) {
      const email = `it-${ts}-${who}@salonmind.test`;
      const { error } = await db.rpc("provision_user", { p_email: email, p_password: "Test12345!", p_name: who });
      assert.ifError(error);
      const u = mk();
      assert.ifError((await u.auth.signInWithPassword({ email, password: "Test12345!" })).error);
      users.push(u);
    }
    const [A, B] = users;
    const tA = (await A.rpc("create_tenant", { p_name: "A salon", p_slug: `a-${ts}`, p_city: "Delhi", p_state: "Delhi", p_state_code: "07", p_gstin: null, p_address: "", p_phone: "", p_description: "" })).data as string;
    const tB = (await B.rpc("create_tenant", { p_name: "B salon", p_slug: `b-${ts}`, p_city: "Delhi", p_state: "Delhi", p_state_code: "07", p_gstin: null, p_address: "", p_phone: "", p_description: "" })).data as string;
    assert.ifError((await A.from("clients").insert({ tenant_id: tA, name: "A's secret client", phone: "+910000000001" })).error);
    assert.equal((await B.from("clients").select("id").eq("tenant_id", tA)).data!.length, 0, "B cannot read A's clients");
    assert.ok((await B.from("clients").insert({ tenant_id: tA, name: "intruder" })).error, "B cannot write into A");
    assert.equal((await B.from("clients").select("id").eq("tenant_id", tenant.id)).data!.length, 0, "B cannot read the test salon");
    assert.ok((await A.rpc("provision_user", { p_email: `x-${ts}@salonmind.test`, p_password: "Test12345!", p_name: "x" })).error, "owners cannot provision accounts");
    for (const [u, t] of [[A, tA], [B, tB]] as const) {
      const { data, error } = await u.rpc("delete_my_account");
      assert.ifError(error); assert.equal(data, 1);
      assert.equal((await db.from("tenants").select("id").eq("id", t)).data!.length, 0);
    }
  });
});
