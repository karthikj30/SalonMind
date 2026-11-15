import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDef, AgentEvent, AgentOutput, Ctx, Tenant } from "./types";
import { AGENTS } from "./registry";
import { DEFAULT_SETTINGS } from "../domain/types";

import { emit } from "./bus";
export { emit };

export function normalizeTenant(t: Tenant): Tenant {
  return { ...t, settings: { ...DEFAULT_SETTINGS, ...(t.settings ?? {}) } };
}

/** Run one agent, persist its run log (observability) and publish the events it emits onto the bus. */
export async function runAgent(def: AgentDef, ctx: Ctx, event?: AgentEvent): Promise<AgentOutput> {
  const t0 = Date.now();
  let out: AgentOutput;
  let status = "ok";
  try {
    out = await def.run(ctx, event);
  } catch (e) {
    status = "error";
    out = { summary: `Error: ${(e as Error).message}` };
    console.error(`[agent:${def.id}]`, e);
  }
  if (!out.skipLog) {
    await ctx.db.from("agent_runs").insert({
      tenant_id: ctx.tenant.id, agent: def.id, trigger: event ? `event:${event.type}` : ctx.trigger,
      summary: out.summary, actions: out.actions ?? [], output: (out.output ?? null) as never,
      provider: out.provider ?? "rules-engine", status, duration_ms: Date.now() - t0,
    });
  }
  for (const e of out.emits ?? []) await emit(ctx.db, ctx.tenant.id, e.type, e.payload, def.id);
  return out;
}

/**
 * Asynchronous agent mesh: drain the tenant's pending events, routing each to every subscribed agent.
 * Agents publish follow-up events (e.g. churn → client.at_risk → retention), which are picked up in the
 * next loop iteration. Bounded to keep serverless invocations short.
 */
export async function processEvents(db: SupabaseClient, tenant: Tenant, maxEvents = 15, deadlineMs = 45_000) {
  const t0 = Date.now();
  let handled = 0;
  while (handled < maxEvents && Date.now() - t0 < deadlineMs) {
    const { data: events } = await db.from("agent_events").select("*")
      .eq("tenant_id", tenant.id).eq("status", "pending").order("created_at").limit(5);
    if (!events?.length) break;
    for (const ev of events as AgentEvent[]) {
      // claim (optimistic): only proceed if we flipped pending → processing
      const { data: claimed } = await db.from("agent_events").update({ status: "processing" })
        .eq("id", ev.id).eq("status", "pending").select("id");
      if (!claimed?.length) continue;
      const subs = AGENTS.filter((a) => a.subscribes.includes(ev.type));
      let err: string | null = null;
      for (const a of subs) {
        const r = await runAgent(a, { db, tenant, trigger: `event:${ev.type}` }, ev);
        if (r.summary.startsWith("Error:")) err = r.summary;
      }
      await db.from("agent_events").update({ status: err ? "failed" : "done", error: err, processed_at: new Date().toISOString() }).eq("id", ev.id);
      handled++;
    }
  }
  return handled;
}

/** Orchestrator tick: run every periodic agent for a tenant, then drain the event bus. */
export async function tick(db: SupabaseClient, tenant: Tenant, only?: string[]) {
  const results: { agent: string; summary: string }[] = [];
  for (const a of AGENTS.filter((x) => x.periodic && (!only || only.includes(x.id)))) {
    const r = await runAgent(a, { db, tenant, trigger: only ? "manual" : "schedule" });
    results.push({ agent: a.id, summary: r.summary });
  }
  const events = await processEvents(db, tenant);
  return { results, events };
}
