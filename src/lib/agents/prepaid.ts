import "server-only";
import type { Action, AgentDef } from "./types";
import { llmTextIn } from "../ai/translate";
import { sendMessage } from "../services/messaging";
import { appUrl } from "../services/prepaid";
import { daysUntil, expiryReminderStage } from "../domain/prepaid";
import { fmtDate, inr, todayIst } from "../time";

/**
 * Prepaid Value Agent — makes sure money customers have already paid turns into visits:
 *  - when a gift card is sold, delivers the code to the recipient (or the buyer) on WhatsApp;
 *  - daily, reminds customers about gift-card balances and package sessions that are about to expire
 *    (once ~2 weeks before, once in the last 3 days), and marks expired gift cards.
 * The code, amounts and dates are appended verbatim — the model only writes the friendly sentence.
 */
export const prepaidAgent: AgentDef = {
  id: "prepaid",
  name: "Prepaid Value Agent",
  module: "CRM & Marketing",
  description: "Delivers gift-card codes on WhatsApp the moment they are sold, and reminds customers about unused gift-card balances and package sessions before they expire.",
  subscribes: ["giftcard.sold"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const today = todayIst();
    const actions: Action[] = [];
    let provider = "rules-engine";

    if (ev?.type === "giftcard.sold") {
      const { data: g } = await db.from("gift_cards").select("*").eq("id", ev.payload.gift_card_id as string).eq("tenant_id", tenant.id).single();
      if (!g) return { summary: "Gift card not found", skipLog: true };
      const phone = g.recipient_phone || g.buyer_phone;
      if (!phone) return { summary: `Gift card ${g.code} issued (${inr(g.amount)}); no mobile number to send it to — hand the code over in person.`, actions: [{ type: "gift_card", label: `${g.code} · ${inr(g.amount)}`, ref: g.id }] };
      const { data: client } = await db.from("clients").select("id, language").eq("tenant_id", tenant.id).eq("phone", phone).maybeSingle();
      const to = g.recipient_phone ? g.recipient_name : g.buyer_name;
      const from = g.recipient_phone && g.buyer_name ? g.buyer_name : null;
      const m = await llmTextIn(client?.language ?? tenant.settings.default_language, {
        system: `Write a warm, short WhatsApp message (max 30 words) from ${tenant.name}, a salon, telling the person they have received a gift card. Do not include any code, amount or date — those are added after your text. No hashtags.`,
        messages: [{ role: "user", content: `Recipient: ${to ?? "customer"}. ${from ? `Gift from ${from}.` : ""} ${g.message ? `Personal note: ${g.message}` : ""}` }],
      }, () => `Hi${to ? ` ${to}` : ""}! ${from ? `${from} sent you` : "You have"} a gift card for ${tenant.name}.${g.message ? ` “${g.message}”` : ""}`);
      provider = m.provider;
      const body = `${m.text}\n\n🎁 ${g.code}\n${inr(g.balance)} · valid till ${fmtDate(g.expires_at)}${tenant.is_published && appUrl() ? `\nBook: ${appUrl()}/s/${tenant.slug}` : ""}`;
      await sendMessage(db, { tenant_id: tenant.id, client_id: client?.id ?? null, phone, contact_handle: phone, channel: "whatsapp", body, agent: "prepaid", meta: { gift_card_id: g.id, kind: "delivery" } });
      return { summary: `Sent gift card ${g.code} (${inr(g.amount)}) to ${to ?? phone} on WhatsApp.`, actions: [{ type: "gift_card", label: `Delivered ${g.code} · ${inr(g.amount)}`, ref: g.id }], provider };
    }

    // ── daily sweep ──
    const { data: expired } = await db.from("gift_cards").update({ status: "expired" }).eq("tenant_id", tenant.id).eq("status", "active").lt("expires_at", today).select("id, code");
    for (const g of expired ?? []) actions.push({ type: "expired", label: `Gift card ${g.code} expired`, ref: g.id });

    const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: cards }, { data: pkgs }] = await Promise.all([
      db.from("gift_cards").select("id, code, balance, expires_at, recipient_name, recipient_phone, buyer_name, buyer_phone").eq("tenant_id", tenant.id).eq("status", "active").gt("balance", 0).gte("expires_at", today).lte("expires_at", soon),
      db.from("client_packages").select("id, sessions_left, expires_at, clients(id, name, phone, language), services(name)").eq("tenant_id", tenant.id).gt("sessions_left", 0).gte("expires_at", today).lte("expires_at", soon),
    ]);

    const remindedAlready = async (meta: Record<string, string>) => {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("agent", "prepaid").contains("meta", meta);
      return !!count;
    };
    const book = tenant.is_published && appUrl() ? `\nBook: ${appUrl()}/s/${tenant.slug}` : "";

    for (const g of cards ?? []) {
      const stage = expiryReminderStage(g.expires_at, today);
      const phone = g.recipient_phone || g.buyer_phone;
      if (!stage || !phone || await remindedAlready({ gift_card_id: g.id, stage })) continue;
      const name = (g.recipient_phone ? g.recipient_name : g.buyer_name) ?? "";
      const { data: client } = await db.from("clients").select("id, language").eq("tenant_id", tenant.id).eq("phone", phone).maybeSingle();
      const days = daysUntil(g.expires_at, today);
      const m = await llmTextIn(client?.language ?? tenant.settings.default_language, {
        system: `Write a friendly WhatsApp reminder (max 25 words) from ${tenant.name}: the customer's gift card is about to expire and they should book a visit. Do not include the code, amount or date.`,
        messages: [{ role: "user", content: `Customer ${name || "there"}, expires in ${days} day(s).` }],
      }, () => `Hi${name ? ` ${name}` : ""}, your ${tenant.name} gift card expires in ${days} day(s) — book a treat before it does!`);
      provider = m.provider;
      await sendMessage(db, { tenant_id: tenant.id, client_id: client?.id ?? null, phone, contact_handle: phone, channel: "whatsapp", body: `${m.text}\n\n🎁 ${g.code} · ${inr(g.balance)} left · valid till ${fmtDate(g.expires_at)}${book}`, agent: "prepaid", meta: { gift_card_id: g.id, stage, kind: "expiry" } });
      actions.push({ type: "remind", label: `Reminded ${name || phone}: gift card ${g.code} (${inr(g.balance)}) expires in ${days} day(s)`, ref: g.id });
    }

    for (const p of pkgs ?? []) {
      const c = p.clients as unknown as { id: string; name: string; phone: string | null; language: string } | null;
      const svc = (p.services as unknown as { name: string } | null)?.name ?? "service";
      const stage = expiryReminderStage(p.expires_at, today);
      if (!stage || !c?.phone || await remindedAlready({ package_id: p.id, stage })) continue;
      const days = daysUntil(p.expires_at, today);
      const m = await llmTextIn(c.language, {
        system: `Write a friendly WhatsApp reminder (max 25 words) from ${tenant.name}: the customer still has prepaid sessions in their package that expire soon; invite them to book. Do not include numbers or dates.`,
        messages: [{ role: "user", content: `Customer ${c.name}, package for ${svc}.` }],
      }, () => `Hi ${c.name}, you still have prepaid ${svc} sessions at ${tenant.name} — book before they expire!`);
      provider = m.provider;
      await sendMessage(db, { tenant_id: tenant.id, client_id: c.id, phone: c.phone, contact_handle: c.phone, channel: "whatsapp", body: `${m.text}\n\n${svc}: ${p.sessions_left} session(s) left · valid till ${fmtDate(p.expires_at)}${book}`, agent: "prepaid", meta: { package_id: p.id, stage, kind: "expiry" } });
      actions.push({ type: "remind", label: `Reminded ${c.name}: ${p.sessions_left} ${svc} session(s) expire in ${days} day(s)`, ref: p.id });
    }

    if (!actions.length) return { summary: "No prepaid balances close to expiry.", skipLog: true };
    const reminders = actions.filter((a) => a.type === "remind").length;
    return { summary: `Prepaid sweep: ${reminders} expiry reminder(s) sent${expired?.length ? `, ${expired.length} gift card(s) marked expired` : ""}.`, actions, provider };
  },
};
