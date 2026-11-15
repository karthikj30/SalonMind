import "server-only";
import type { AgentDef, Tenant } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llmJson } from "../ai/llm";
import { DATASETS, type DatasetKey, type Widget } from "../services/metrics";
import { PARAM_BOUNDS, parseWorkflow, sanitizePlan, type WorkflowPlan } from "../domain/workflow";
import { AGENTS } from "./registry";

/**
 * Self-optimising engine: tunes the tenant's operating parameters from its own data, within safe bounds.
 * Every change is logged with the before/after value and the reason.
 */
export const optimizerAgent: AgentDef = {
  id: "optimizer",
  name: "Self-Optimizing Agent",
  module: "Platform",
  description: "Adjusts deposit/nudge thresholds, surge and discount caps from observed no-show rates and occupancy (bounded, logged).",
  subscribes: [],
  periodic: true,
  async run({ db, tenant }) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: b } = await db.from("bookings").select("status, start_at, end_at").eq("tenant_id", tenant.id).gte("start_at", since).lte("start_at", new Date().toISOString());
    const { data: staff } = await db.from("staff").select("id").eq("tenant_id", tenant.id).eq("active", true);
    const fin = (b ?? []).filter((x) => ["completed", "no_show"].includes(x.status));
    if (fin.length < 5) return { summary: `Need ≥5 completed/no-show bookings in 30 days to self-tune (have ${fin.length}).`, skipLog: true };
    const s = { ...tenant.settings };
    const changes: string[] = [];
    const nsRate = fin.filter((x) => x.status === "no_show").length / fin.length;
    const bookedMin = (b ?? []).filter((x) => x.status === "completed").reduce((a, x) => a + (new Date(x.end_at).getTime() - new Date(x.start_at).getTime()) / 60000, 0);
    const occ = bookedMin / Math.max(1, (staff?.length ?? 1) * 30 * 600);
    const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K], why: string) => { if (s[k] !== v) { changes.push(`${String(k)}: ${s[k]} → ${v} (${why})`); s[k] = v; } };
    if (nsRate > 0.15) { set("deposit_threshold", Math.max(0.35, Math.round((s.deposit_threshold - 0.05) * 100) / 100), `no-show rate ${Math.round(nsRate * 100)}%`); set("nudge_threshold", Math.max(0.15, Math.round((s.nudge_threshold - 0.05) * 100) / 100), "more nudges"); }
    else if (nsRate < 0.05) set("deposit_threshold", Math.min(0.75, Math.round((s.deposit_threshold + 0.05) * 100) / 100), `no-show rate only ${Math.round(nsRate * 100)}%`);
    if (occ > 0.75) set("surge_cap_pct", Math.min(35, s.surge_cap_pct + 5), `occupancy ${Math.round(occ * 100)}%`);
    if (occ < 0.3) set("flash_discount_cap_pct", Math.min(30, s.flash_discount_cap_pct + 5), `occupancy ${Math.round(occ * 100)}%`);
    if (changes.length) await db.from("tenants").update({ settings: s }).eq("id", tenant.id);
    return { summary: changes.length ? `Self-tuned ${changes.length} parameter(s).` : `Parameters optimal (no-show ${Math.round(nsRate * 100)}%, occupancy ${Math.round(occ * 100)}%).`, actions: changes.map((c) => ({ type: "tune", label: c })), skipLog: !changes.length };
  },
};

/** Generative micro-frontend: natural-language → validated dashboard layout schema (rendered by a safe widget registry). */
export async function generateLayout(db: SupabaseClient, tenant: Tenant, prompt: string, language: string) {
  const keys = Object.keys(DATASETS) as DatasetKey[];
  const r = await llmJson<{ widgets: Widget[] }>({
    system: `You design a salon owner's dashboard. Available datasets: ${keys.map((k) => `${k} (${DATASETS[k].kind}: ${DATASETS[k].title})`).join(", ")}.
Return JSON {widgets:[{dataset, title, span}]} with 3-9 widgets, span 1-3 (grid of 3 columns). Titles in language code "${language}". Only use the listed datasets.`,
    messages: [{ role: "user", content: prompt }],
  }, () => {
    const p = prompt.toLowerCase();
    const picked = keys.filter((k) => k.split("_").some((w) => w.length > 2 && p.includes(w)) || DATASETS[k].title.toLowerCase().split(" ").some((w) => w.length > 3 && p.includes(w)));
    return { widgets: (picked.length ? picked : ["revenue_today", "bookings_today", "upcoming_bookings"] as DatasetKey[]).map((d) => ({ dataset: d, span: DATASETS[d].kind === "kpi" ? 1 : 2 })) };
  });
  const widgets = (r.data.widgets ?? []).filter((w) => keys.includes(w.dataset)).slice(0, 9).map((w) => ({ ...w, span: Math.min(3, Math.max(1, Number(w.span) || 1)) as 1 | 2 | 3 }));
  await db.from("tenants").update({ ui_layout: { widgets, prompt, language, generated_at: new Date().toISOString(), provider: r.provider } }).eq("id", tenant.id);
  await db.from("agent_runs").insert({ tenant_id: tenant.id, agent: "studio", trigger: "manual", summary: `Generated dashboard micro-frontend (${widgets.length} widgets) from: "${prompt}"`, provider: r.provider, actions: [] });
  return { widgets, provider: r.provider };
}

/**
 * Workflow designer: plain-language instruction → validated change set (pause/resume agents, tune
 * parameters). The LLM only *proposes*; `sanitizePlan` enforces the allow-list and bounds.
 */
export async function configureWorkflow(db: SupabaseClient, tenant: Tenant, prompt: string) {
  const ids = AGENTS.map((a) => a.id);
  const r = await llmJson<WorkflowPlan>({
    system: `You configure a salon's AI agents. Agents: ${AGENTS.map((a) => `${a.id} (${a.name}: ${a.description})`).join("; ")}.
Settings with allowed ranges: ${Object.entries(PARAM_BOUNDS).map(([k, b]) => `${k} ${b.min}-${b.max}`).join(", ")}. Thresholds are 0-1 probabilities.
Current: disabled=${JSON.stringify(tenant.settings.agents_disabled ?? [])}, settings=${JSON.stringify(Object.fromEntries(Object.keys(PARAM_BOUNDS).map((k) => [k, (tenant.settings as Record<string, unknown>)[k]])))}.
Return JSON {disable: agent ids to pause, enable: agent ids to resume, settings: {key: number} only for values the owner asked to change, notes: short strings explaining anything you could not do}.`,
    messages: [{ role: "user", content: prompt }], temperature: 0,
  }, () => parseWorkflow(prompt, ids));
  const plan = sanitizePlan(r.data, ids);
  const before = tenant.settings;
  const disabled = new Set(before.agents_disabled ?? []);
  plan.disable.forEach((a) => disabled.add(a));
  plan.enable.forEach((a) => disabled.delete(a));
  const next = { ...before, ...plan.settings, agents_disabled: [...disabled] };
  const name = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;
  const actions = [
    ...plan.disable.map((a) => ({ type: "pause", label: `Paused ${name(a)}` })),
    ...plan.enable.map((a) => ({ type: "resume", label: `Resumed ${name(a)}` })),
    ...Object.entries(plan.settings).map(([k, v]) => ({ type: "tune", label: `${PARAM_BOUNDS[k].label}: ${(before as Record<string, unknown>)[k]} → ${v}` })),
    ...plan.notes.map((n) => ({ type: "note", label: n })),
  ];
  const changed = plan.disable.length + plan.enable.length + Object.keys(plan.settings).length;
  if (changed) await db.from("tenants").update({ settings: next }).eq("id", tenant.id);
  await db.from("agent_runs").insert({ tenant_id: tenant.id, agent: "workflow-designer", trigger: "manual", summary: changed ? `Applied ${changed} workflow change(s) from: "${prompt}"` : `No changes understood from: "${prompt}"`, actions, provider: r.provider });
  return { plan, changed, actions, provider: r.provider };
}

export async function setAgentEnabled(db: SupabaseClient, tenant: Tenant, agentId: string, enabled: boolean) {
  const plan = sanitizePlan(enabled ? { enable: [agentId] } : { disable: [agentId] }, AGENTS.map((a) => a.id));
  const disabled = new Set(tenant.settings.agents_disabled ?? []);
  plan.disable.forEach((a) => disabled.add(a));
  plan.enable.forEach((a) => disabled.delete(a));
  await db.from("tenants").update({ settings: { ...tenant.settings, agents_disabled: [...disabled] } }).eq("id", tenant.id);
  return plan;
}
