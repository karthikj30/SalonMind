import "server-only";
import type { AgentDef } from "./types";
import { pointsEarned, matchWaitlist, type WaitEntry } from "../domain/loyalty";
import { visitCycle } from "../domain/crm";
import { llmText, LANGUAGES } from "../ai/llm";
import { sendMessage } from "../services/messaging";
import { planBooking } from "../services/booking";
import { addDays, fmtDate, fmtDateTime, inr, todayIst, toIst } from "../time";

/** Loyalty & referrals: points on every invoice, referral bonus when a referred client completes a first visit. */
export const loyaltyAgent: AgentDef = {
  id: "loyalty",
  name: "Loyalty & Referral Agent",
  module: "CRM & Marketing",
  description: "Credits loyalty points on every paid invoice and rewards the referrer when a referred client completes their first visit.",
  subscribes: ["invoice.issued"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const p = ev!.payload as { invoice_id: string; client_id: string | null; total: number };
    if (!p.client_id) return { summary: "Walk-in without client — no points.", skipLog: true };
    const { data: c } = await db.from("clients").select("id, name, phone, loyalty_points, referred_by").eq("id", p.client_id).single();
    if (!c) return { summary: "Client not found" };
    const actions = [];
    const pts = pointsEarned(Number(p.total), tenant.settings.loyalty_points_per_100);
    if (pts > 0) {
      await db.from("clients").update({ loyalty_points: Number(c.loyalty_points) + pts }).eq("id", c.id);
      await db.from("wallet_transactions").insert({ tenant_id: tenant.id, client_id: c.id, kind: "loyalty_earn", points: pts, ref: p.invoice_id, note: `${tenant.settings.loyalty_points_per_100} pt per ₹100` });
      actions.push({ type: "points", label: `${c.name} earned ${pts} points (balance ${Number(c.loyalty_points) + pts})`, ref: c.id });
    }
    if (c.referred_by) {
      const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", c.id).eq("status", "completed").eq("is_historical", false);
      const { data: already } = await db.from("wallet_transactions").select("id").eq("kind", "referral_bonus").eq("ref", c.id).limit(1);
      if ((count ?? 0) <= 1 && !already?.length) {
        const { data: ref } = await db.from("clients").select("id, name, phone, loyalty_points, consent_marketing").eq("id", c.referred_by).single();
        if (ref) {
          const bonus = tenant.settings.referral_bonus_points;
          await db.from("clients").update({ loyalty_points: Number(ref.loyalty_points) + bonus }).eq("id", ref.id);
          await db.from("wallet_transactions").insert({ tenant_id: tenant.id, client_id: ref.id, kind: "referral_bonus", points: bonus, ref: c.id, note: `referred ${c.name}` });
          if (ref.consent_marketing) await sendMessage(db, { tenant_id: tenant.id, client_id: ref.id, phone: ref.phone, contact_handle: ref.phone, channel: "whatsapp", agent: "loyalty",
            body: `Thank you ${ref.name}! ${c.name} just had their first visit at ${tenant.name}. We've added ${bonus} bonus points (= ${inr(bonus)}) to your account. 🎁` });
          actions.push({ type: "referral", label: `Referral bonus ${bonus} pts → ${ref.name} (referred ${c.name})`, ref: ref.id });
        }
      }
    }
    return { summary: actions.length ? actions.map((a) => a.label).join("; ") : "No points to credit.", actions, skipLog: !actions.length };
  },
};

/**
 * Reputation & rebooking: happy clients get a Google-review request + a personalised "next visit" date;
 * unhappy clients (≤3★) trigger service recovery — an apology, a manager callback, and an alert.
 */
export const reputationAgent: AgentDef = {
  id: "reputation",
  name: "Reputation & Rebooking Agent",
  module: "CRM & Marketing",
  description: "After checkout: requests Google reviews from happy clients, runs service recovery for ≤3★ visits, and suggests the next visit date from the client's own cycle.",
  subscribes: ["invoice.issued"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const p = ev!.payload as { booking_id?: string; client_id: string | null };
    if (!p.booking_id || !p.client_id) return { summary: "Not a service invoice.", skipLog: true };
    const [{ data: b }, { data: c }, { data: past }] = await Promise.all([
      db.from("bookings").select("rating, review, review_sentiment, start_at, services(name), staff(name)").eq("id", p.booking_id).single(),
      db.from("clients").select("id, name, phone, language, consent_marketing, avg_cycle_days").eq("id", p.client_id).single(),
      db.from("bookings").select("start_at").eq("client_id", p.client_id).eq("status", "completed"),
    ]);
    if (!b || !c) return { summary: "Booking/client not found" };
    const svc = (b.services as unknown as { name: string } | null)?.name ?? "service";
    const stylist = (b.staff as unknown as { name: string } | null)?.name;
    const cyc = visitCycle((past ?? []).map((x) => new Date(x.start_at)), 30);
    const nextDate = addDays(toIst(new Date(b.start_at)).date, Math.round(c.avg_cycle_days ?? cyc.avg));
    const unhappy = (b.rating !== null && b.rating <= 3) || (b.review_sentiment !== null && b.review_sentiment < -0.2);
    const lang = LANGUAGES[c.language] ?? "English";
    const actions = [];
    let provider = "rules-engine";
    if (unhappy) {
      const m = await llmText({
        system: `You are the manager of ${tenant.name}. Write a sincere WhatsApp apology (max 50 words) in ${lang}. Promise a personal callback within 2 hours and a complimentary fix. No excuses, no discounts in numbers.`,
        messages: [{ role: "user", content: `Client ${c.name}, ${svc}${stylist ? " with " + stylist : ""}, rating ${b.rating ?? "?"}/5. Review: ${b.review ?? "(none)"}` }],
      }, () => `Dear ${c.name}, we're truly sorry your ${svc} at ${tenant.name} didn't meet expectations. Our manager will call you within 2 hours, and we'd love to make it right with a complimentary fix.`);
      provider = m.provider;
      await sendMessage(db, { tenant_id: tenant.id, client_id: c.id, phone: c.phone, contact_handle: c.phone, channel: "whatsapp", body: m.text, agent: "reputation", meta: { kind: "service_recovery" } });
      await db.from("campaigns").insert({ tenant_id: tenant.id, client_id: c.id, type: "service_recovery", message: m.text, channel: "whatsapp" });
      actions.push({ type: "recovery", label: `⚠ Service recovery for ${c.name} (${b.rating ?? "?"}★) — manager callback needed`, ref: c.id });
    } else if (c.consent_marketing) {
      const ask = b.rating !== null && b.rating >= 4 && tenant.google_review_url;
      const m = await llmText({
        system: `Write a warm WhatsApp thank-you (max 55 words) in ${lang} from ${tenant.name}. ${ask ? `Ask for a Google review at ${tenant.google_review_url}.` : ""} Suggest booking the next ${svc} around ${fmtDate(nextDate)}. Reply YES to book.`,
        messages: [{ role: "user", content: `Client ${c.name}, ${svc}${stylist ? " with " + stylist : ""}, rating ${b.rating ?? "n/a"}.` }],
      }, () => `Thank you for visiting ${tenant.name}, ${c.name}! ${ask ? `If you loved your ${svc}, a quick Google review means a lot: ${tenant.google_review_url} ` : ""}Your next ${svc} is due around ${fmtDate(nextDate)} — reply YES and we'll hold a slot${stylist ? ` with ${stylist}` : ""}.`);
      provider = m.provider;
      await sendMessage(db, { tenant_id: tenant.id, client_id: c.id, phone: c.phone, contact_handle: c.phone, channel: "whatsapp", body: m.text, agent: "reputation", meta: { kind: ask ? "review_request" : "rebook", next_visit: nextDate } });
      actions.push({ type: ask ? "review_request" : "rebook", label: `${ask ? "Review request + " : ""}rebook nudge → ${c.name} (next ~${fmtDate(nextDate)})`, ref: c.id });
    }
    return { summary: actions[0]?.label ?? "No outreach (no marketing consent).", actions, provider, skipLog: !actions.length };
  },
};

/** Automated waitlist: when a slot frees up, offer it to the first matching waitlisted client; expire stale entries. */
export const waitlistAgent: AgentDef = {
  id: "waitlist",
  name: "Waitlist Agent",
  module: "Scheduling & Resources",
  description: "When a booking is cancelled or moved, offers the freed slot to the first matching waitlisted client (FIFO, same service, date & time window); expires stale entries.",
  subscribes: ["booking.cancelled"],
  periodic: true,
  async run({ db, tenant }, ev) {
    if (!ev) {
      const { data } = await db.from("waitlist").update({ status: "expired" }).eq("tenant_id", tenant.id).in("status", ["waiting", "offered"]).lt("date", todayIst()).select("id");
      return { summary: `Expired ${data?.length ?? 0} past waitlist entr(ies).`, skipLog: !data?.length };
    }
    const { data: bk } = await db.from("bookings").select("start_at, service_id").eq("id", ev.payload.booking_id as string).single();
    const start = (ev.payload.freed_start as string) ?? bk?.start_at;
    const serviceId = (ev.payload.service_id as string) ?? bk?.service_id;
    if (!start || !serviceId || new Date(start) < new Date()) return { summary: "Freed slot is in the past.", skipLog: true };
    const slot = { service_id: serviceId, date: toIst(new Date(start)).date, time: toIst(new Date(start)).time };
    const { data: entries } = await db.from("waitlist").select("*, clients(id, name, phone, language)").eq("tenant_id", tenant.id).eq("status", "waiting").eq("service_id", serviceId);
    const matches = matchWaitlist((entries ?? []) as WaitEntry[], slot);
    if (!matches.length) return { summary: `Slot ${slot.date} ${slot.time} freed — nobody on the waitlist for it.`, skipLog: true };
    // confirm the slot really is bookable now (stylist/room free)
    const plan = await planBooking(db, tenant, { service_id: serviceId, date: slot.date, from: slot.time, to: slot.time }, 1).catch(() => null);
    if (!plan?.slots.length) return { summary: `Slot ${slot.date} ${slot.time} no longer free.`, skipLog: true };
    const w = (entries ?? []).find((e) => e.id === matches[0].id)!;
    const c = w.clients as { id: string; name: string; phone: string | null; language: string };
    const svc = plan.service.name;
    const m = await llmText({
      system: `Write a short WhatsApp message (max 40 words) in ${LANGUAGES[c.language] ?? "English"} from ${tenant.name}: a waitlisted ${svc} slot opened. Ask them to reply YES within 2 hours to grab it.`,
      messages: [{ role: "user", content: `Client ${c.name}, slot ${fmtDateTime(plan.slots[0].start)}, price ${inr(plan.slots[0].quote.price)}.` }],
    }, () => `Good news ${c.name}! A ${svc} slot just opened at ${tenant.name} on ${fmtDateTime(plan.slots[0].start)} (${inr(plan.slots[0].quote.price)}). Reply YES within 2 hours to grab it.`);
    await db.from("waitlist").update({ status: "offered", offered_slot: plan.slots[0].start.toISOString() }).eq("id", w.id);
    await sendMessage(db, { tenant_id: tenant.id, client_id: c.id, phone: c.phone, contact_handle: c.phone, channel: "whatsapp", body: m.text, agent: "waitlist", meta: { waitlist_id: w.id } });
    return { summary: `Offered freed ${svc} slot ${fmtDateTime(plan.slots[0].start)} to ${c.name} (#1 of ${matches.length} on waitlist).`, actions: [{ type: "waitlist_offer", label: `${c.name} ← ${fmtDateTime(plan.slots[0].start)}`, ref: w.id }], provider: m.provider };
  },
};
