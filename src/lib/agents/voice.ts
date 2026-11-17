import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDef, Tenant } from "./types";
import { aiEnabled, LANGUAGES, llmJson } from "../ai/llm";
import { parseVoice, QUERY_TOPICS, sanitizeActions, VOICE_HELP, VOICE_ROUTES, type QueryTopic, type VoiceAction, type VoiceContext } from "../domain/voice";
import { addDays, fmtDateTime, inr, istDate, todayIst } from "../time";
import { translateKeeping } from "../ai/translate";
import { isTLang } from "../domain/translate";
import { detectLang } from "../i18n/concierge";

/** Spoken answers to "how is my salon doing?" questions — computed from the database, never by the model. */
export async function answerQuery(db: SupabaseClient, tenant: Tenant, topic: QueryTopic, protect: string[] = []): Promise<string> {
  const from = istDate(todayIst(), "00:00").toISOString(), to = istDate(addDays(todayIst(), 1), "00:00").toISOString();
  const bookings = async () => {
    const { data } = await db.from("bookings").select("start_at, status, clients(name), services(name)").eq("tenant_id", tenant.id).gte("start_at", from).lt("start_at", to).neq("status", "cancelled").order("start_at");
    const next = (data ?? []).find((b) => new Date(b.start_at) > new Date() && b.status !== "completed") as { start_at: string; clients: { name: string } | null; services: { name: string } | null } | undefined;
    if (next) protect.push(next.clients?.name ?? "", next.services?.name ?? "");
    return `${data?.length ?? 0} booking${data?.length === 1 ? "" : "s"} today${next ? `; next is ${next.clients?.name ?? "a client"} for ${next.services?.name ?? "a service"} at ${fmtDateTime(next.start_at).split(", ").pop()}` : ""}.`;
  };
  const revenue = async () => {
    const { data } = await db.from("invoices").select("total").eq("tenant_id", tenant.id).gte("created_at", from).lt("created_at", to);
    return `Revenue today is ${inr((data ?? []).reduce((a, i) => a + Number(i.total), 0))} from ${data?.length ?? 0} invoice${data?.length === 1 ? "" : "s"}.`;
  };
  const stock = async () => {
    const { data } = await db.from("products").select("name, stock_qty, reorder_level").eq("tenant_id", tenant.id);
    const low = (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.reorder_level));
    protect.push(...low.slice(0, 5).map((p) => p.name));
    return low.length ? `${low.length} product${low.length === 1 ? " is" : "s are"} at or below reorder level: ${low.slice(0, 5).map((p) => p.name).join(", ")}.` : "No product is below its reorder level.";
  };
  const risk = async () => {
    const { data } = await db.from("clients").select("name, churn_risk").eq("tenant_id", tenant.id).gte("churn_risk", 0.6).order("churn_risk", { ascending: false }).limit(5);
    protect.push(...(data ?? []).map((c) => c.name));
    return data?.length ? `${data.length} client${data.length === 1 ? " is" : "s are"} at risk of leaving: ${data.map((c) => c.name).join(", ")}.` : "No clients are flagged at risk right now.";
  };
  const handoffs = async () => {
    const { count } = await db.from("conversations").select("contact_handle", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("status", "human");
    return count ? `${count} conversation${count === 1 ? " is" : "s are"} waiting for a human reply in the inbox.` : "No conversations are waiting for you — the AI concierge is handling the inbox.";
  };
  switch (topic) {
    case "bookings_today": return bookings();
    case "revenue_today": return revenue();
    case "low_stock": return stock();
    case "at_risk": return risk();
    case "handoffs": return handoffs();
    case "summary": return (await Promise.all([bookings(), revenue(), handoffs(), stock()])).join(" ");
  }
}

export type VoiceResult = { actions: VoiceAction[]; say: string; provider: string };

/**
 * Voice Agent — turns what the user said (any supported language) into safe UI actions for the page they are on.
 * The LLM only proposes; `sanitizeActions` keeps what really exists on the page and drops anything destructive.
 * Without an LLM (or when it fails) the deterministic parser handles English, Hinglish and common Indian-language commands.
 */
export async function interpretVoice(o: { db?: SupabaseClient; tenant?: Tenant; text: string; lang?: string; ctx: VoiceContext; allowLlm: boolean; skipNav?: boolean }): Promise<VoiceResult> {
  const text = o.text.trim().slice(0, 500);
  const rules = () => parseVoice(text, o.ctx);
  let actions: VoiceAction[] = [], provider = "rules-engine", say = "";
  const ruled = rules();
  // a confident rules result (not just "sorry") is used directly: instant, free and predictable
  const confident = ruled.length > 0 && !(ruled.length === 1 && ruled[0].type === "say" && ruled[0].text.startsWith("Sorry"));
  if (confident || !o.allowLlm || !aiEnabled()) actions = ruled;
  else {
    const r = await llmJson<{ actions: unknown; say?: string }>({
      system: `You control a salon-management web app by voice. The user speaks ${LANGUAGES[o.lang ?? "en"] ?? "English"} (possibly mixed with English). Turn the request into UI actions for the CURRENT page only.
Return JSON {"actions":[...],"say":"one short sentence in the user's language"}.
Action types:
{"type":"navigate","path":P} — P is one of: ${VOICE_ROUTES.map((r) => `${r.path} (${r.title})`).join(", ")}
{"type":"fill","form":N,"name":FIELD_NAME,"value":"text"} — only fields listed below; dates as YYYY-MM-DD (today is ${todayIst()}), times as HH:MM 24h, phone digits only, select values from the options
{"type":"submit","form":N} — ONLY if the user explicitly says save/submit/confirm
{"type":"click","label":EXACT_BUTTON_LABEL} — only buttons listed below
{"type":"query","topic":T} — T is one of ${QUERY_TOPICS.join(", ")} (questions about today's business)
{"type":"theme","mode":"dark"|"light"}, {"type":"scroll","dir":"up"|"down"|"top"|"bottom"}, {"type":"back"}
Never invent fields, buttons or paths. Never delete anything. Never fill passwords. If the request is unclear, return no actions and ask a short question in "say".`,
      messages: [{ role: "user", content: JSON.stringify({ said: text, page: o.ctx.path, forms: o.ctx.forms, fields: o.ctx.fields.map((f) => ({ ...f, options: f.options?.slice(0, 25) })), buttons: o.ctx.buttons.slice(0, 40) }) }],
      temperature: 0,
    }, () => ({ actions: null }));
    const clean = r.data?.actions === null ? [] : sanitizeActions(r.data?.actions, o.ctx);
    if (r.provider !== "rules-engine" && (clean.length || r.data?.say)) { actions = clean; provider = r.provider; say = typeof r.data?.say === "string" ? r.data.say.slice(0, 300) : ""; }
    else actions = ruled;
  }
  actions = sanitizeActions(actions, o.ctx);
  if (o.skipNav) actions = actions.filter((a) => a.type !== "navigate");

  // answer questions from live data
  const spoken: string[] = [];
  const protect: string[] = []; // names that must not be sent to a translation provider
  for (const a of actions) {
    if (a.type === "query") spoken.push(o.db && o.tenant ? await answerQuery(o.db, o.tenant, a.topic, protect) : "Sign in to ask about your salon.");
    if (a.type === "say") spoken.push(a.text);
  }
  actions = actions.filter((a) => a.type !== "query" && a.type !== "say");
  if (!say || spoken.length) say = [say, ...spoken].filter(Boolean).join(" ");
  if (!say) say = describe(actions, o.ctx);
  // reply in the user's language: rules-engine sentences are translated, with every name kept on the server
  if (o.lang && o.lang !== "en" && isTLang(o.lang) && say && detectLang(say) === "en") {
    protect.push(...o.ctx.fields.map((f) => f.label));
    const t = await translateKeeping(say, o.lang, protect);
    if (t) { say = t.text; if (provider === "rules-engine") provider = `rules-engine+${t.provider}`; }
  }

  if (o.db && o.tenant) {
    await o.db.from("agent_runs").insert({
      tenant_id: o.tenant.id, agent: "voice", trigger: "voice", summary: `Heard a ${text.split(/\s+/).length}-word command on ${o.ctx.path} → ${actions.map((a) => a.type).join(", ") || "answer only"}`,
      actions: actions.map((a) => ({ type: a.type, label: a.type === "fill" ? `fill ${a.name}` : a.type === "navigate" ? `open ${a.path}` : a.type === "click" ? `click ${a.label}` : a.type })),
      output: null, provider, status: "ok", duration_ms: 0,
    });
  }
  return { actions, say, provider };
}

function describe(actions: VoiceAction[], ctx: VoiceContext): string {
  if (!actions.length) return `I couldn't do that here. ${VOICE_HELP}`;
  const parts: string[] = [];
  const nav = actions.find((a) => a.type === "navigate");
  if (nav?.type === "navigate") parts.push(`Opening ${VOICE_ROUTES.find((r) => r.path === nav.path)?.title ?? nav.path}.`);
  const fills = actions.filter((a) => a.type === "fill");
  if (fills.length) {
    const label = (n: string) => ctx.fields.find((f) => f.name === n)?.label.replace(/\(.*?\)/g, "").trim() ?? n;
    parts.push(`Filled ${fills.map((f) => (f.type === "fill" ? label(f.name) : "")).join(", ")}.${actions.some((a) => a.type === "submit") ? "" : ' Say "save" when it looks right.'}`);
  }
  if (actions.some((a) => a.type === "submit")) parts.push("Submitting.");
  const click = actions.find((a) => a.type === "click");
  if (click?.type === "click") parts.push(`Pressing ${click.label}.`);
  if (actions.some((a) => a.type === "theme")) parts.push("Theme changed.");
  return parts.join(" ") || "Done.";
}

/** Registry entry: the agent is interactive (driven by /api/voice/command); running it manually reports usage. */
export const voiceAgent: AgentDef = {
  id: "voice",
  name: "Voice Agent",
  module: "Platform",
  description: "Hands-free control: listens (browser speech recognition or free Whisper), understands commands in English and Indian languages, navigates, fills forms and answers questions about today's business. Never submits or deletes on its own.",
  subscribes: [],
  periodic: false,
  async run({ db, tenant }) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data } = await db.from("agent_runs").select("actions, provider").eq("tenant_id", tenant.id).eq("agent", "voice").eq("trigger", "voice").gte("created_at", since).limit(500);
    const kinds = new Map<string, number>();
    (data ?? []).forEach((r) => ((r.actions ?? []) as { type: string }[]).forEach((a) => kinds.set(a.type, (kinds.get(a.type) ?? 0) + 1)));
    return {
      summary: data?.length ? `${data.length} voice command(s) in the last 7 days — ${[...kinds.entries()].map(([k, v]) => `${k} ×${v}`).join(", ") || "answers only"}.` : "No voice commands yet — tap the microphone button (bottom-right) and say “open bookings”.",
      output: { commands: data?.length ?? 0, by_action: Object.fromEntries(kinds) },
    };
  },
};
