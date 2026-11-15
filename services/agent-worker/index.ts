/**
 * SalonMind agent-worker — standalone microservice that consumes the agent event bus.
 *
 * The web tier (Next.js) only *publishes* events (booking.created, message.received, …). This worker
 * claims pending events (optimistic pending→processing update, so N replicas never double-process),
 * routes them to subscribed agents, and lets agents publish follow-up events — the asynchronous
 * multi-agent mesh from RFP §2. Horizontal scaling: Kubernetes HPA on CPU / events backlog.
 *
 *   GET /healthz  liveness      GET /readyz  readiness (DB reachable)      GET /metrics  Prometheus
 */
import http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeTenant, processEvents } from "../../src/lib/agents/runtime";
import type { Tenant } from "../../src/lib/agents/types";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000);
const CONCURRENCY = Number(process.env.WORKER_TENANT_CONCURRENCY ?? 4);
const PORT = Number(process.env.PORT ?? 8080);
const metrics = { events_processed_total: 0, loop_iterations_total: 0, loop_errors_total: 0, tenants_served_total: 0, last_loop_ms: 0, backlog: 0 };
let db: SupabaseClient | null = null;
let tokenExpiresAt = 0;
let ready = false;
let stopping = false;

async function client() {
  if (db && tokenExpiresAt - Date.now() > 120_000) return db;
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: process.env.AGENT_BOT_EMAIL!, password: process.env.AGENT_BOT_PASSWORD! });
  if (error || !data.session) throw new Error("agent service account sign-in failed: " + error?.message);
  db = c; tokenExpiresAt = (data.session.expires_at ?? 0) * 1000;
  return c;
}

async function loop() {
  const t0 = Date.now();
  const c = await client();
  const { data: pending, error } = await c.from("agent_events").select("tenant_id").eq("status", "pending").order("created_at").limit(500);
  if (error) throw new Error(error.message);
  ready = true;
  metrics.backlog = pending?.length ?? 0;
  const tenantIds = [...new Set((pending ?? []).map((e) => e.tenant_id as string))];
  if (tenantIds.length) {
    const { data: tenants } = await c.from("tenants").select("*").in("id", tenantIds);
    const queue = [...(tenants ?? [])] as Tenant[];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        metrics.events_processed_total += await processEvents(c, normalizeTenant(t), 25, 50_000, { fromWorker: true });
        metrics.tenants_served_total++;
      }
    }));
  }
  metrics.loop_iterations_total++;
  metrics.last_loop_ms = Date.now() - t0;
}

async function run() {
  console.log(`[agent-worker] started — poll ${POLL_MS}ms, tenant concurrency ${CONCURRENCY}`);
  while (!stopping) {
    try { await loop(); } catch (e) { metrics.loop_errors_total++; ready = false; console.error("[agent-worker]", (e as Error).message); }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

http.createServer((req, res) => {
  if (req.url === "/healthz") return void res.writeHead(200).end("ok");
  if (req.url === "/readyz") return void res.writeHead(ready ? 200 : 503).end(ready ? "ready" : "not ready");
  if (req.url === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    return void res.end(Object.entries(metrics).map(([k, v]) => `# TYPE salonmind_worker_${k} ${k.endsWith("_total") ? "counter" : "gauge"}\nsalonmind_worker_${k} ${v}`).join("\n") + "\n");
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`[agent-worker] health/metrics on :${PORT}`));

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { console.log(`[agent-worker] ${sig} — draining`); stopping = true; setTimeout(() => process.exit(0), 5000).unref(); });
run();
