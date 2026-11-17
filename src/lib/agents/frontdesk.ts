import "server-only";
import type { AgentDef } from "./types";
import { llmTextIn } from "../ai/translate";
import { sendMessage } from "../services/messaging";
import { queueState } from "../services/queue";
import { waitLabel } from "../domain/queue";
import { answerQuery } from "./voice";
import { todayIst, toIst } from "../time";

/**
 * Queue Agent — when the walk-in line moves, tells the next customers (who gave a phone number) that their
 * turn is close, so they can wait outside or shop instead of crowding the reception.
 */
export const queueAgent: AgentDef = {
  id: "queue",
  name: "Walk-in Queue Agent",
  module: "Scheduling & Resources",
  description: "Runs the walk-in token queue: estimates waits from the stylists' real calendar and messages the next customers when their turn is near.",
  subscribes: ["queue.advanced"],
  periodic: false,
  async run({ db, tenant }) {
    const q = await queueState(db, tenant);
    const actions = [];
    for (const w of q.waiting.slice(0, 2)) {
      if (!w.phone || w.eta.waitMin === null || w.eta.waitMin > 15) continue;
      // one "your turn is near" message per token
      const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("agent", "queue").contains("meta", { walkin_id: w.id });
      if (count) continue;
      const { data: client } = await db.from("clients").select("id, language").eq("tenant_id", tenant.id).eq("phone", w.phone).maybeSingle();
      const m = await llmTextIn(client?.language ?? tenant.settings.default_language, {
        system: `Write a very short WhatsApp message (max 25 words) from ${tenant.name}: the customer's walk-in token is almost up. Friendly, no emojis except one.`,
        messages: [{ role: "user", content: `Customer ${w.name}, token ${w.token_no}, wait ${waitLabel(w.eta.waitMin)}.` }],
      }, () => `Hi ${w.name}, token ${w.token_no} at ${tenant.name}: your turn is ${w.eta.waitMin === 0 ? "now" : `in ${waitLabel(w.eta.waitMin)}`}. Please come to the reception.`);
      await sendMessage(db, { tenant_id: tenant.id, client_id: client?.id ?? null, phone: w.phone, contact_handle: w.phone, channel: "whatsapp", body: m.text, agent: "queue", meta: { walkin_id: w.id, token_no: w.token_no } });
      actions.push({ type: "notify", label: `Token ${w.token_no} (${w.name}) told their turn is ${waitLabel(w.eta.waitMin)}`, ref: w.id });
    }
    if (!actions.length) return { summary: `Queue: ${q.waiting.length} waiting, ${q.serving.length} being served.`, skipLog: true };
    return { summary: `Queue moved — notified ${actions.length} waiting customer(s). ${q.waiting.length} waiting, ${q.serving.length} being served.`, actions };
  },
};

/**
 * Daily Briefing Agent — once a day, sends the owner a WhatsApp summary computed from the database:
 * today's bookings, revenue so far, chats waiting for a human and low stock. Numbers never come from a model.
 */
export const briefingAgent: AgentDef = {
  id: "briefing",
  name: "Daily Briefing Agent",
  module: "Platform",
  description: "Sends the owner one WhatsApp briefing a day: bookings, revenue, conversations needing a human and low stock — all computed from live data.",
  subscribes: [],
  periodic: true,
  async run({ db, tenant, trigger }) {
    if (!tenant.phone) return { summary: "Add the salon's phone number in Settings to receive the daily briefing.", skipLog: true };
    const today = todayIst();
    if (trigger !== "manual") {
      if (toIst(new Date()).minutes < 8 * 60) return { summary: "Too early for the briefing.", skipLog: true }; // not before 8 am IST
      const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("agent", "briefing").contains("meta", { date: today });
      if (count) return { summary: "Briefing already sent today.", skipLog: true };
    }
    const facts = await answerQuery(db, tenant, "summary");
    const risk = await answerQuery(db, tenant, "at_risk");
    const body = `Good day from SalonMind — ${tenant.name}, ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short" })}:\n• ${facts.replace(/\. (?=[A-Z0-9])/g, ".\n• ")}\n• ${risk}`;
    await sendMessage(db, { tenant_id: tenant.id, phone: tenant.phone, contact_handle: tenant.phone, channel: "whatsapp", body, agent: "briefing", meta: { date: today, kind: "owner_briefing" } });
    return { summary: `Daily briefing sent to the owner (${tenant.phone}).`, actions: [{ type: "briefing", label: body.split("\n").slice(1, 3).join(" ") }] };
  },
};
