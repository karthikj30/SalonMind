/**
 * Microservice topology test (RFP §4: microservices + async agents). Runs against containers:
 *   WEB_URL=http://localhost:8081 WORKER_METRICS_URL=http://localhost:8090 npm run test:integration
 * The web tier runs with AGENT_EXECUTION=worker (publish-only); the agent-worker container must
 * consume the events asynchronously. Skipped when the URLs are not set.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const WEB = process.env.WEB_URL, METRICS = process.env.WORKER_METRICS_URL;
const skip = !WEB || !METRICS;
const { normalizeTenant, processEvents } = await import("../../src/lib/agents/runtime");
const { createBooking, findOrCreateClient } = await import("../../src/lib/services/booking");
const { addDays, todayIst } = await import("../../src/lib/time");
type Tenant = import("../../src/lib/agents/types").Tenant;

let db: SupabaseClient, tenant: Tenant;
const metric = async (name: string) => Number((await (await fetch(`${METRICS}/metrics`)).text()).match(new RegExp(`salonmind_worker_${name} (\\d+)`))?.[1] ?? NaN);

before(async () => {
  if (skip) return;
  db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: process.env.AGENT_BOT_EMAIL!, password: process.env.AGENT_BOT_PASSWORD! });
  const { data } = await db.from("tenants").insert({ name: `MS Salon ${Date.now().toString(36)}`, slug: `ms-${Date.now().toString(36)}`, state_code: "27", is_published: false }).select("*").single();
  tenant = normalizeTenant(data as Tenant);
});
after(async () => { if (tenant) await db.from("tenants").delete().eq("id", tenant.id); });

test("web and worker containers are healthy", { skip }, async () => {
  assert.equal((await fetch(`${WEB}/login`)).status, 200);
  assert.equal((await fetch(`${WEB}/api/agents/tick`)).status, 401, "cron endpoint requires the secret");
  assert.equal((await fetch(`${METRICS}/healthz`)).status, 200);
  assert.equal((await fetch(`${METRICS}/readyz`)).status, 200);
});

test("web tier only publishes; the agent-worker microservice consumes asynchronously", { skip }, async () => {
  process.env.AGENT_EXECUTION = "worker";
  const before = await metric("events_processed_total");
  await db.from("staff").insert({ tenant_id: tenant.id, name: "Worker Test Stylist", skill_level: 3 });
  const { data: svc } = await db.from("services").insert({ tenant_id: tenant.id, name: "Haircut", base_price: 500, duration_min: 45 }).select("id").single();
  const c = await findOrCreateClient(db, tenant.id, { name: "Async Asha", phone: "+919800012345" });
  const r = await createBooking(db, tenant, { client_id: c.id, service_id: svc!.id, date: addDays(todayIst(), 1), time: "12:00", source: "walkin" });
  assert.equal(await processEvents(db, tenant), 0, "inline processing is disabled in worker mode");
  let status = "pending";
  for (let i = 0; i < 30 && status !== "done"; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    status = (await db.from("agent_events").select("status").eq("tenant_id", tenant.id).eq("type", "booking.created").single()).data!.status;
  }
  assert.equal(status, "done", "worker processed booking.created");
  const { data: b } = await db.from("bookings").select("no_show_risk").eq("id", r.booking.id).single();
  assert.ok(b!.no_show_risk !== null, "No-Show Agent ran inside the worker container");
  assert.ok((await metric("events_processed_total")) > before, "worker metrics counted the event");
});
