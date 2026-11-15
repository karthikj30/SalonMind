import "server-only";
import type { AgentDef, Tenant } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { churnRisk, lexiconSentiment, visitCycle } from "../domain/crm";
import { LANGUAGES, llmJson, llmText } from "../ai/llm";
import { sendMessage } from "../services/messaging";
import { createBooking, findOrCreateClient, planBooking } from "../services/booking";
import { addDays, fmtDateTime, inr, todayIst, toIst } from "../time";

const lang = (code?: string | null) => LANGUAGES[code ?? "en"] ?? "English";

/** Module 2 — Predictive churn analytics (visit-frequency + review sentiment + no-shows). */
export const churnAgent: AgentDef = {
  id: "churn",
  name: "Churn Analytics Agent",
  module: "CRM & Marketing",
  description: "Scores every client's churn risk from visit-cycle drift, review sentiment and no-shows; launches recovery when risk is high.",
  subscribes: ["booking.reviewed", "booking.completed"],
  periodic: true,
  async run({ db, tenant }, ev) {
    let provider = "rules-engine";
    const actions = [];
    // Sentiment analysis of a new review (LLM, multilingual) — falls back to EN/Hinglish lexicon.
    if (ev?.type === "booking.reviewed") {
      const { data: b } = await db.from("bookings").select("id, review, rating").eq("id", ev.payload.booking_id as string).single();
      if (b?.review) {
        const r = await llmJson<{ sentiment: number; topics: string[] }>({
          system: "Return JSON {sentiment: number between -1 and 1, topics: string[]} for this salon review (any Indian language).",
          messages: [{ role: "user", content: b.review }],
        }, () => ({ sentiment: lexiconSentiment(b.review) + (b.rating ? (b.rating - 3) / 4 : 0), topics: [] }));
        const s = Math.max(-1, Math.min(1, Number(r.data.sentiment)));
        provider = r.provider;
        await db.from("bookings").update({ review_sentiment: s }).eq("id", b.id);
        actions.push({ type: "sentiment", label: `Review sentiment ${s.toFixed(2)}${r.data.topics?.length ? " · " + r.data.topics.join(", ") : ""}`, ref: b.id });
      }
    }
    const clientFilter = ev?.payload.client_id as string | undefined;
    let q = db.from("clients").select("id, name, churn_risk").eq("tenant_id", tenant.id);
    if (ev) {
      const { data: b } = await db.from("bookings").select("client_id").eq("id", ev.payload.booking_id as string).single();
      q = q.eq("id", b?.client_id ?? clientFilter ?? "00000000-0000-0000-0000-000000000000");
    }
    const { data: clients } = await q;
    const ids = (clients ?? []).map((c) => c.id);
    if (!ids.length) return { summary: "No clients to score yet.", skipLog: !ev };
    const { data: bookings } = await db.from("bookings").select("client_id, start_at, status, review_sentiment").in("client_id", ids);
    const emits = [];
    let atRisk = 0;
    for (const c of clients ?? []) {
      const mine = (bookings ?? []).filter((b) => b.client_id === c.id);
      const done = mine.filter((b) => b.status === "completed").map((b) => new Date(b.start_at));
      const cyc = visitCycle(done);
      const last = done.length ? Math.max(...done.map((d) => d.getTime())) : null;
      const sentiments = mine.map((b) => b.review_sentiment).filter((x): x is number => x !== null);
      const hasFuture = mine.some((b) => ["booked", "confirmed"].includes(b.status) && new Date(b.start_at) > new Date());
      const r = churnRisk({
        daysSinceLast: last ? (Date.now() - last) / 86_400_000 : null, avgCycle: cyc.avg, lastGap: cyc.lastGap,
        sentiment: sentiments.length ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : null,
        noShows: mine.filter((b) => b.status === "no_show").length, visits: cyc.visits,
      });
      const risk = hasFuture ? Math.min(r.risk, 0.2) : r.risk;
      await db.from("clients").update({ churn_risk: risk, avg_cycle_days: Math.round(cyc.avg), last_visit_at: last ? new Date(last).toISOString() : null }).eq("id", c.id);
      if (risk >= 0.6 && (c.churn_risk ?? 0) < 0.6) {
        atRisk++;
        emits.push({ type: "client.at_risk", payload: { client_id: c.id, risk, factors: r.factors } });
        actions.push({ type: "at_risk", label: `${c.name} at risk (${Math.round(risk * 100)}%): ${r.factors.join("; ")}`, ref: c.id });
      }
    }
    return { summary: `Scored ${ids.length} client(s); ${atRisk ? `${atRisk} newly at risk → recovery protocol triggered` : "none newly at risk"}.`, actions, emits, provider };
  },
};

async function writeOffer(tenant: Tenant, client: { name: string; language: string }, ctx: string, fallback: string) {
  return llmText({
    system: `You are the CRM agent for ${tenant.name}, a salon in ${tenant.city ?? "India"}. Write ONE WhatsApp message (max 55 words) in ${lang(client.language)}. Warm, personal, no hashtags, include the concrete offer and a call to action to reply to book. Never invent prices other than given.`,
    messages: [{ role: "user", content: ctx }],
    temperature: 0.7,
  }, () => fallback);
}

/** Module 2 — Autonomous retention campaigns (cycle-based) + churn recovery. */
export const retentionAgent: AgentDef = {
  id: "retention",
  name: "Campaign Agent",
  module: "CRM & Marketing",
  description: "Detects clients overdue vs. their personal visit cycle (e.g. 4-week haircut, now week 5) and sends a hyper-personalised WhatsApp/SMS offer.",
  subscribes: ["client.at_risk"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const recentCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: recent } = await db.from("campaigns").select("client_id").eq("tenant_id", tenant.id).gte("created_at", recentCutoff);
    const contacted = new Set((recent ?? []).map((r) => r.client_id));
    let targets: { id: string; name: string; phone: string | null; language: string; avg_cycle_days: number | null; last_visit_at: string | null; consent_marketing: boolean }[] = [];
    const type = ev ? "churn_recovery" : "retention";
    if (ev) {
      const { data } = await db.from("clients").select("*").eq("id", ev.payload.client_id as string);
      targets = data ?? [];
    } else {
      const { data } = await db.from("clients").select("*").eq("tenant_id", tenant.id).not("last_visit_at", "is", null);
      const { data: future } = await db.from("bookings").select("client_id").eq("tenant_id", tenant.id).in("status", ["booked", "confirmed"]).gte("start_at", new Date().toISOString());
      const hasFuture = new Set((future ?? []).map((f) => f.client_id));
      targets = (data ?? []).filter((c) => {
        const cycle = Number(c.avg_cycle_days ?? 30);
        const since = (Date.now() - new Date(c.last_visit_at).getTime()) / 86_400_000;
        return since > cycle + Math.min(tenant.settings.retention_grace_days, cycle * 0.25) && !hasFuture.has(c.id);
      });
    }
    targets = targets.filter((c) => c.consent_marketing && !contacted.has(c.id)).slice(0, 10);
    if (!targets.length) return { summary: ev ? "Client already contacted recently or no marketing consent — skipped." : "No overdue clients right now.", skipLog: !ev };

    let provider = "rules-engine";
    const actions = [];
    for (const c of targets) {
      const { data: last } = await db.from("bookings").select("start_at, services(name, base_price), staff(name)").eq("client_id", c.id).eq("status", "completed").order("start_at", { ascending: false }).limit(1).maybeSingle();
      const svc = (last?.services as unknown as { name: string; base_price: number } | null);
      const stylist = (last?.staff as unknown as { name: string } | null)?.name;
      const pct = type === "churn_recovery" ? 20 : 10;
      const since = c.last_visit_at ? Math.round((Date.now() - new Date(c.last_visit_at).getTime()) / 86_400_000) : null;
      const ctx = `Client: ${c.name}. Usual cycle: every ${Math.round(Number(c.avg_cycle_days ?? 30))} days; last visit ${since ?? "?"} days ago for ${svc?.name ?? "a service"}${stylist ? " with " + stylist : ""}. ${type === "churn_recovery" ? "They seem unhappy / drifting away — apologise softly and win them back." : "Gentle reminder that it's time again."} Offer: ${pct}% off ${svc?.name ?? "their next visit"}${svc ? ` (usual ${inr(svc.base_price)})` : ""}, valid 7 days.`;
      const msg = await writeOffer(tenant, c, ctx,
        `Hi ${c.name}! It's been ${since ?? "a while"} days since your last ${svc?.name ?? "visit"} at ${tenant.name}${stylist ? ` with ${stylist}` : ""}. Enjoy ${pct}% off your next ${svc?.name ?? "service"} this week — reply YES to book your slot. 💇`);
      provider = msg.provider;
      await sendMessage(db, { tenant_id: tenant.id, client_id: c.id, phone: c.phone, contact_handle: c.phone, channel: "whatsapp", body: msg.text, agent: "retention", meta: { campaign: type, discount_pct: pct } });
      await db.from("campaigns").insert({ tenant_id: tenant.id, client_id: c.id, type, message: msg.text, channel: "whatsapp", status: "sent" });
      actions.push({ type: "campaign", label: `${type === "churn_recovery" ? "Recovery" : "Retention"} offer → ${c.name}`, ref: c.id });
    }
    return { summary: `Sent ${actions.length} personalised ${type.replace("_", " ")} message(s).`, actions, provider };
  },
};

type Intent = { language: string; intent: "book" | "availability" | "price" | "cancel" | "reschedule" | "complaint" | "faq" | "greeting" | "other"; service: string | null; date: string | null; time: string | null; name: string | null };

function ruleIntent(text: string): Intent {
  const s = text.toLowerCase();
  const devanagari = /[ऀ-ॿ]/.test(text);
  const intent: Intent["intent"] = /\b(cancel|radd)\b/.test(s) ? "cancel" : /\b(book|appointment|slot|reserve)\b/.test(s) ? "book"
    : /\b(price|cost|rate|kitna|charges?)\b/.test(s) ? "price" : /\b(available|free|open|timing)\b/.test(s) ? "availability"
    : /\b(bad|worst|complain|rude|refund)\b/.test(s) ? "complaint" : /\b(hi|hello|namaste|hey)\b/.test(s) ? "greeting" : "other";
  const today = todayIst();
  const date = /\btomorrow|kal\b/.test(s) ? addDays(today, 1) : /\btoday|aaj\b/.test(s) ? today : null;
  const t = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  let time: string | null = null;
  if (t) { let h = Number(t[1]); if (t[3] === "pm" && h < 12) h += 12; if (t[3] === "am" && h === 12) h = 0; time = `${String(h).padStart(2, "0")}:${t[2] ?? "00"}`; }
  return { language: devanagari ? "hi" : "en", intent, service: null, date, time, name: null };
}

/**
 * Module 2 — Unified communications: one AI customer-service representative for WhatsApp, Instagram DMs,
 * Google Business messages, call transcripts and web chat. Understands Indian languages, answers from the
 * salon's real catalogue + live availability, and books directly through the scheduling engine.
 */
export const conciergeAgent: AgentDef = {
  id: "concierge",
  name: "AI Concierge",
  module: "CRM & Marketing",
  description: "Unified inbox rep: replies to WhatsApp/Instagram/Google/call/web messages in the customer's language and books appointments via the scheduler.",
  subscribes: ["message.received"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const { data: msg } = await db.from("messages").select("*").eq("id", ev!.payload.message_id as string).single();
    if (!msg) return { summary: "Message not found" };
    const handle = msg.contact_handle ?? "";
    const { data: thread } = await db.from("messages").select("direction, body").eq("tenant_id", tenant.id).eq("contact_handle", handle).order("created_at", { ascending: false }).limit(10);
    const { data: services } = await db.from("services").select("id, name, category, base_price, duration_min").eq("tenant_id", tenant.id).eq("active", true);
    let client = msg.client_id ? (await db.from("clients").select("*").eq("id", msg.client_id).single()).data : null;
    if (!client && /^\+?\d{10,13}$/.test(handle.replace(/\s/g, ""))) client = (await db.from("clients").select("*").eq("tenant_id", tenant.id).eq("phone", handle.replace(/\s/g, "")).maybeSingle()).data;

    const catalogue = (services ?? []).map((s) => `${s.name} (${s.category}) ${inr(s.base_price)}, ${s.duration_min}min`).join("; ");
    const history = (thread ?? []).reverse().map((m) => `${m.direction === "in" ? "Customer" : "Salon"}: ${m.body}`).join("\n");
    const today = todayIst();
    const ex = await llmJson<Intent>({
      system: `Extract intent from a salon customer conversation. Today is ${today} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][toIst(new Date()).dow]}), timezone IST. Services: ${catalogue || "none"}.
Return JSON {language: ISO code of the customer's language (en, hi, ta, te, bn, mr, kn, ml, gu, pa), intent: one of book|availability|price|cancel|reschedule|complaint|faq|greeting|other, service: exact service name from the list or null, date: YYYY-MM-DD or null, time: HH:MM 24h or null, name: customer's name if they said it, else null}.`,
      messages: [{ role: "user", content: history || msg.body }],
      temperature: 0,
    }, () => ruleIntent(msg.body));
    const it = ex.data;
    const svc = (services ?? []).find((s) => it.service && s.name.toLowerCase() === it.service.toLowerCase())
      ?? (services ?? []).find((s) => msg.body.toLowerCase().includes(s.name.toLowerCase()) || msg.body.toLowerCase().includes(s.category.toLowerCase()));

    // Ground the reply in real data
    const facts: string[] = [];
    const actions = [];
    if ((it.intent === "book" || it.intent === "availability") && svc) {
      const date = it.date ?? today;
      if (it.intent === "book" && it.time) {
        try {
          if (!client) client = await findOrCreateClient(db, tenant.id, { name: it.name ?? (msg.meta?.name as string) ?? "Guest", phone: /^\+?\d{10,13}$/.test(handle) ? handle : null, language: it.language });
          const r = await createBooking(db, tenant, { client_id: client!.id, service_id: svc.id, date, time: it.time, source: msg.channel });
          facts.push(`BOOKED: ${svc.name} on ${fmtDateTime(r.booking.start_at)} with ${r.slot.staff.name}, price ${inr(r.booking.price)} (${r.booking.pricing_note}).`);
          actions.push({ type: "booking", label: `Booked ${svc.name} for ${client!.name} at ${fmtDateTime(r.booking.start_at)}`, ref: r.booking.id });
        } catch (e) {
          facts.push(`Could not book ${it.time}: ${(e as Error).message}.`);
        }
      }
      if (!facts.some((f) => f.startsWith("BOOKED"))) {
        const plan = await planBooking(db, tenant, { service_id: svc.id, date }, 4).catch(() => null);
        facts.push(plan?.slots.length ? `Open slots for ${svc.name} on ${date}: ${plan.slots.map((s) => `${toIst(s.start).time} with ${s.staff.name} ${inr(s.quote.price)}`).join(", ")}.` : `No open slots for ${svc.name} on ${date}.`);
      }
    }
    if (it.intent === "price" && svc) facts.push(`${svc.name} costs ${inr(svc.base_price)} (+18% GST), ${svc.duration_min} minutes.`);
    if (it.intent === "cancel" && client) {
      const { data: next } = await db.from("bookings").select("id, start_at").eq("client_id", client.id).in("status", ["booked", "confirmed"]).gte("start_at", new Date().toISOString()).order("start_at").limit(1).maybeSingle();
      if (next) {
        await db.from("bookings").update({ status: "cancelled" }).eq("id", next.id);
        await db.from("agent_events").insert({ tenant_id: tenant.id, type: "booking.cancelled", payload: { booking_id: next.id }, source: "concierge" });
        facts.push(`CANCELLED booking on ${fmtDateTime(next.start_at)}.`);
        actions.push({ type: "cancel", label: `Cancelled booking for ${client.name}`, ref: next.id });
      } else facts.push("No upcoming booking found to cancel.");
    }
    if (it.intent === "complaint") facts.push("Escalate: apologise, say the manager will call back within 2 hours.");

    const reply = await llmText({
      system: `You are the friendly AI receptionist of ${tenant.name} (${tenant.city ?? ""}), hours ${tenant.open_time.slice(0, 5)}–${tenant.close_time.slice(0, 5)}. Reply on ${msg.channel} in ${lang(it.language)} (use the customer's script). Max 70 words. Use ONLY these facts; never invent prices or slots. Services: ${catalogue}. Facts: ${facts.join(" ") || "none"}. If booking details are missing, ask for the missing service/date/time.`,
      messages: [{ role: "user", content: history || msg.body }],
      temperature: 0.5,
    }, () => facts.length ? facts.map((f) => f.replace(/^(BOOKED|CANCELLED): /, "✅ ")).join("\n") + (facts.some((f) => f.startsWith("Open slots")) ? "\nReply with a time to book." : "")
      : `Namaste! Thanks for messaging ${tenant.name}. ${catalogue ? "We offer: " + catalogue.split("; ").slice(0, 5).join(", ") + "." : ""} Tell me the service, date and time you'd like and I'll book it for you.`);

    await sendMessage(db, { tenant_id: tenant.id, client_id: client?.id ?? null, contact_handle: handle, phone: client?.phone, channel: msg.channel, body: reply.text, agent: "concierge", meta: { intent: it.intent, language: it.language } });
    if (client && !msg.client_id) await db.from("messages").update({ client_id: client.id }).eq("id", msg.id);
    return {
      summary: `[${msg.channel}] intent=${it.intent} lang=${it.language}${svc ? " service=" + svc.name : ""} → replied${actions.length ? " + " + actions.map((a) => a.type).join(", ") : ""}.`,
      actions, provider: reply.provider === "rules-engine" ? ex.provider : reply.provider, output: { intent: it, facts },
    };
  },
};

export async function receiveMessage(db: SupabaseClient, tenantId: string, m: { channel: string; handle: string; body: string; name?: string | null }) {
  const phone = m.handle.replace(/\s/g, "");
  const { data: client } = /^\+?\d{10,13}$/.test(phone) ? await db.from("clients").select("id").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle() : { data: null };
  const { data, error } = await db.from("messages").insert({
    tenant_id: tenantId, client_id: client?.id ?? null, contact_handle: phone || m.handle, channel: m.channel, direction: "in",
    body: m.body, status: "received", meta: m.name ? { name: m.name } : {},
  }).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("agent_events").insert({ tenant_id: tenantId, type: "message.received", payload: { message_id: data.id }, source: m.channel });
  return data.id as string;
}
