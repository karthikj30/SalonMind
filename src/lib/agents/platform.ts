import "server-only";
import type { AgentDef, Tenant } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llmJson } from "../ai/llm";
import { DATASETS, type DatasetKey, type Widget } from "../services/metrics";

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
