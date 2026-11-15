/**
 * Natural-language workflow configuration (RFP §2 "configure workflows based on a salon's specific data").
 * An owner types e.g. "Turn off the waitlist agent and ask for a 40% deposit" → a validated change set:
 * agents to pause/resume + parameter changes, each clamped to safe bounds. The LLM may propose changes,
 * but only this module decides what is allowed.
 */
export const PARAM_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  surge_cap_pct: { min: 0, max: 50, label: "Surge cap %" },
  flash_discount_cap_pct: { min: 0, max: 50, label: "Flash discount cap %" },
  nudge_threshold: { min: 0.05, max: 0.95, label: "Nudge threshold" },
  deposit_threshold: { min: 0.05, max: 0.95, label: "Deposit threshold" },
  deposit_pct: { min: 0, max: 100, label: "Deposit %" },
  reorder_buffer_days: { min: 0, max: 30, label: "Reorder buffer (days)" },
  retention_grace_days: { min: 0, max: 60, label: "Retention grace (days)" },
  loyalty_points_per_100: { min: 0, max: 10, label: "Loyalty points per ₹100" },
  loyalty_max_redeem_pct: { min: 0, max: 100, label: "Max points redemption %" },
  referral_bonus_points: { min: 0, max: 5000, label: "Referral bonus points" },
};

/** Agents that keep the books legal can't be switched off from a chat prompt. */
export const PROTECTED_AGENTS = ["billing"];

export const AGENT_ALIASES: Record<string, string[]> = {
  inventory: ["inventory", "procurement", "restock", "purchase order", "stock"],
  negotiator: ["negotiat", "vendor"],
  waste: ["waste", "smart-scale", "scale"],
  concierge: ["concierge", "receptionist", "auto-repl", "auto repl", "inbox", "chat"],
  churn: ["churn"],
  retention: ["campaign", "retention", "win-back", "winback", "birthday", "offers"],
  loyalty: ["loyalty", "points", "referral"],
  reputation: ["reputation", "review", "rebook"],
  noshow: ["no-show", "noshow", "no show", "nudge", "reminder"],
  deals: ["deal", "flash", "yield", "surge", "discount agent", "last-minute"],
  waitlist: ["waitlist", "wait list", "waiting list"],
  recruiter: ["recruit", "hiring", "job ad", "candidate"],
  performance: ["performance", "coach", "training", "micro-learning"],
  billing: ["billing", "invoice"],
  gst: ["gst", "tax return"],
  optimizer: ["optimiz", "self-tun", "auto-tun"],
};

export type WorkflowPlan = { disable: string[]; enable: string[]; settings: Record<string, number>; notes: string[] };

const OFF = /\b(turn off|switch off|disable|stop|pause|deactivate|don'?t|do not|no more|mute|off)\b/;
const ON = /\b(turn on|switch on|enable|start|resume|activate|re-?enable|back on|bring back)\b/;

/** Deterministic parser used when no LLM is configured, and to cross-check LLM output. */
export function parseWorkflow(prompt: string, knownAgents: string[]): WorkflowPlan {
  const plan: WorkflowPlan = { disable: [], enable: [], settings: {}, notes: [] };
  const text = prompt.toLowerCase();
  for (const clause of text.split(/(?:,|;|\.|\band then\b|\bthen\b|\band\b|\balso\b)/)) {
    const hits = Object.entries(AGENT_ALIASES).filter(([id, words]) => knownAgents.includes(id) && words.some((w) => clause.includes(w))).map(([id]) => id);
    if (!hits.length) continue;
    // "surge"/"deposit"/"discount" inside a *parameter* clause are not agent toggles
    if (/\d/.test(clause) && !OFF.test(clause) && !ON.test(clause)) continue;
    const on = ON.test(clause), off = OFF.test(clause) && !on;
    for (const id of hits) {
      if (off) plan.disable.push(id);
      else if (on) plan.enable.push(id);
    }
  }
  const num = (re: RegExp) => { const g = text.match(re)?.slice(1).find((x) => x !== undefined); return g ? Number(g) : null; };
  const set = (k: string, v: number | null) => { if (v !== null && !Number.isNaN(v)) plan.settings[k] = v; };
  set("deposit_pct", num(/(\d{1,3})\s*%\s*deposit|deposit[^.,;\d]{0,25}?(?:of|to|at|=)?\s*(\d{1,3})\s*%/) ?? num(/deposit[^.,;\d]{0,25}?(\d{1,3})\s*%/));
  set("surge_cap_pct", num(/surge[^.,;\d]{0,25}?(\d{1,3})\s*%/));
  set("flash_discount_cap_pct", num(/(?:flash|discount)[^.,;\d]{0,25}?(\d{1,3})\s*%/));
  set("retention_grace_days", num(/grace[^.,;\d]{0,20}?(\d{1,2})\s*days?/) ?? num(/(\d{1,2})\s*days?\s*(?:of\s*)?grace/));
  set("reorder_buffer_days", num(/(?:reorder|safety)\s*buffer[^.,;\d]{0,20}?(\d{1,2})/));
  set("loyalty_points_per_100", num(/(\d{1,2})\s*points?\s*(?:per|for every|every)\s*₹?\s*100/));
  set("referral_bonus_points", num(/referral[^.,;\d]{0,25}?(\d{1,5})/));
  set("loyalty_max_redeem_pct", num(/redeem[^.,;\d]{0,30}?(\d{1,3})\s*%/));
  const thr = text.match(/(nudge|deposit)\s*(?:risk\s*)?threshold[^.,;\d]{0,15}?(0?\.\d+|\d{1,2}\s*%)/);
  if (thr) { const v = thr[2].includes("%") ? parseFloat(thr[2]) / 100 : parseFloat(thr[2]); plan.settings[`${thr[1]}_threshold`] = v; }
  return plan;
}

/** Validate + clamp any proposed plan (from the LLM or the parser). */
export function sanitizePlan(p: Partial<WorkflowPlan>, knownAgents: string[]): WorkflowPlan {
  const notes: string[] = [];
  const pick = (xs: unknown) => [...new Set((Array.isArray(xs) ? xs : []).map(String).filter((x) => knownAgents.includes(x)))];
  let disable = pick(p.disable);
  const blocked = disable.filter((a) => PROTECTED_AGENTS.includes(a));
  if (blocked.length) { notes.push(`${blocked.join(", ")} stays on — it issues legally required GST invoices.`); disable = disable.filter((a) => !blocked.includes(a)); }
  const enable = pick(p.enable).filter((a) => !disable.includes(a));
  const settings: Record<string, number> = {};
  for (const [k, raw] of Object.entries(p.settings ?? {})) {
    const b = PARAM_BOUNDS[k];
    const v = Number(raw);
    if (!b || Number.isNaN(v)) { notes.push(`Ignored unknown setting "${k}".`); continue; }
    const c = Math.min(b.max, Math.max(b.min, v));
    if (c !== v) notes.push(`${b.label} clamped to ${c} (allowed ${b.min}–${b.max}).`);
    settings[k] = c;
  }
  return { disable, enable, settings, notes: [...(p.notes ?? []), ...notes] };
}
