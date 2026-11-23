import "server-only";
import type { AgentDef } from "./types";
import { noShowRisk } from "../domain/noshow";
import { occupancy } from "../domain/scheduling";
import { llmText, LANGUAGES } from "../ai/llm";
import { llmTextIn } from "../ai/translate";
import { sendMessage } from "../services/messaging";
import { upiLink } from "../domain/upi";
import { manageLink } from "../services/prepaid";
import { addDays, festivalOn, fmtDateTime, inr, istDate, timeToMin, todayIst, toIst } from "../time";

/** Module 3 — No-show mitigation: risk score → confirmation nudge and/or partial deposit. */
export const noShowAgent: AgentDef = {
  id: "noshow",
  name: "No-Show Agent",
  module: "Scheduling & Resources",
  description: "Scores each booking's no-show probability; sends confirmation nudges above the nudge threshold and demands a partial deposit above the deposit threshold.",
  subscribes: ["booking.created"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const s = tenant.settings;
    let q = db.from("bookings").select("*, clients(id, name, phone, language), services(name)").eq("tenant_id", tenant.id);
    q = ev ? q.eq("id", ev.payload.booking_id as string)
      : q.eq("status", "booked").gte("start_at", new Date().toISOString()).lte("start_at", new Date(Date.now() + 36 * 3_600_000).toISOString());
    const { data: bookings } = await q;
    const actions = [];
    let provider = "rules-engine";
    for (const b of bookings ?? []) {
      if (!ev && b.no_show_risk !== null && b.no_show_risk < s.nudge_threshold) continue;
      const { data: hist } = await db.from("bookings").select("status").eq("client_id", b.client_id).neq("id", b.id).in("status", ["completed", "no_show"]);
      const r = noShowRisk({
        pastBookings: hist?.length ?? 0, pastNoShows: (hist ?? []).filter((h) => h.status === "no_show").length,
        leadHours: (new Date(b.start_at).getTime() - new Date(b.created_at).getTime()) / 3_600_000,
        hour: Math.floor(toIst(new Date(b.start_at)).minutes / 60), depositPaid: Number(b.deposit_paid), source: b.source,
      });
      const deposit = r.risk >= s.deposit_threshold && Number(b.deposit_paid) === 0 ? Math.round((Number(b.price) * s.deposit_pct) / 100) : Number(b.deposit_required);
      await db.from("bookings").update({ no_show_risk: r.risk, deposit_required: deposit }).eq("id", b.id);
      const client = b.clients as { id: string; name: string; phone: string | null; language: string } | null;
      if (client && (r.risk >= s.nudge_threshold || (!ev && b.status === "booked"))) {
        const alreadyNudged = (await db.from("messages").select("id").eq("client_id", client.id).eq("agent", "noshow").contains("meta", { booking_id: b.id }).limit(1)).data?.length;
        if (!alreadyNudged) {
          let pay = "";
          if (deposit && tenant.upi_vpa) { try { pay = " " + upiLink({ vpa: tenant.upi_vpa, name: tenant.name, amount: deposit, note: `Deposit ${b.services?.name ?? "booking"}`, ref: b.id.slice(0, 12) }); } catch { /* invalid VPA in settings */ } }
          const fallback = `Hi ${client.name}, reminder: your ${b.services?.name ?? "appointment"} at ${tenant.name} is on ${fmtDateTime(b.start_at)}. Reply 1 to confirm or 2 to reschedule.${deposit ? ` To hold the slot, please pay a ${inr(deposit)} deposit via UPI.${pay}` : ""}`;
          const m = await llmTextIn(client.language, {
            system: `Write a short WhatsApp appointment confirmation nudge (max 45 words) in ${LANGUAGES[client.language] ?? "English"} for salon ${tenant.name}. Include: reply 1 to confirm, 2 to reschedule.${deposit ? ` Also ask for a ${inr(deposit)} UPI deposit to hold the slot${pay ? ` and include this exact payment link on its own line: ${pay.trim()}` : ""}.` : ""}`,
            messages: [{ role: "user", content: `Client ${client.name}, ${b.services?.name}, ${fmtDateTime(b.start_at)}.` }],
          }, () => fallback);
          provider = m.provider;
          // self-service link appended verbatim (never passed through the model) so customers can move or cancel themselves
          const link = b.manage_token && manageLink(b.manage_token).startsWith("http") ? `\n${manageLink(b.manage_token)}` : "";
          await sendMessage(db, { tenant_id: tenant.id, client_id: client.id, phone: client.phone, contact_handle: client.phone, channel: "whatsapp", body: m.text + link, agent: "noshow", meta: { booking_id: b.id, risk: r.risk } });
          actions.push({ type: "nudge", label: `Nudged ${client.name} (risk ${Math.round(r.risk * 100)}%: ${r.factors.join(", ") || "baseline"})${deposit ? ` + deposit ${inr(deposit)}` : ""}`, ref: b.id });
        }
      } else if (ev) {
        actions.push({ type: "score", label: `Risk ${Math.round(r.risk * 100)}% (${r.factors.join(", ") || "baseline"}) — no action needed`, ref: b.id });
      }
    }
    if (!ev && !actions.length) return { summary: "No risky upcoming bookings.", skipLog: true };
    return { summary: `Scored ${bookings?.length ?? 0} booking(s); ${actions.filter((a) => a.type === "nudge").length} nudge(s) sent.`, actions, provider };
  },
};

/**
 * Module 3 + 5 — Yield management: flash discounts for empty mid-week slots, last-minute deals on
 * cancellations, festival packages. Deals are published to the consumer marketplace in real time.
 */
export const dealsAgent: AgentDef = {
  id: "deals",
  name: "Yield Pricing Agent",
  module: "Scheduling & Resources",
  description: "Surge-prices high-demand windows (Diwali weekends) and injects flash discounts / last-minute deals for empty slots into the marketplace.",
  subscribes: ["booking.cancelled"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const s = tenant.settings;
    const { data: services } = await db.from("services").select("id, name, base_price, duration_min").eq("tenant_id", tenant.id).eq("active", true).order("base_price", { ascending: false });
    if (!services?.length) return { summary: "No services yet.", skipLog: true };
    const actions = [];
    if (ev) {
      const { data: bk } = await db.from("bookings").select("*, services(name)").eq("id", ev.payload.booking_id as string).single();
      // on reschedule the booking row already moved — use the freed slot carried in the event
      const b = bk && ev.payload.freed_start ? { ...bk, start_at: ev.payload.freed_start as string, service_id: ev.payload.service_id as string } : bk;
      if (b && new Date(b.start_at) > new Date()) {
        const pct = Math.min(s.flash_discount_cap_pct, 15);
        await db.from("deals").insert({ tenant_id: tenant.id, service_id: b.service_id, kind: "last_minute", discount_pct: pct, slot_start: b.start_at, valid_to: b.start_at,
          title: `Last-minute: ${b.services?.name} ${pct}% off`, description: `A slot just opened at ${fmtDateTime(b.start_at)}. Grab it before it's gone!`, created_by: "agent:deals" });
        actions.push({ type: "deal", label: `Last-minute deal for freed slot ${fmtDateTime(b.start_at)}`, ref: b.id });
      }
      return { summary: actions.length ? "Cancellation turned into a last-minute marketplace deal." : "Cancelled slot already in the past.", actions };
    }
    const { data: staff } = await db.from("staff").select("id").eq("tenant_id", tenant.id).eq("active", true);
    const today = todayIst();
    const { data: bookings } = await db.from("bookings").select("start_at, end_at, status").eq("tenant_id", tenant.id)
      .gte("start_at", istDate(today, "00:00").toISOString()).lte("start_at", istDate(addDays(today, 3), "23:59").toISOString());
    const { data: existing } = await db.from("deals").select("slot_start, kind").eq("tenant_id", tenant.id).eq("active", true).gte("valid_to", new Date().toISOString());
    const have = new Set((existing ?? []).map((d) => `${d.kind}|${d.slot_start ? toIst(new Date(d.slot_start)).date : ""}`));
    const open = timeToMin(tenant.open_time.slice(0, 5)), close = timeToMin(tenant.close_time.slice(0, 5));
    const report = [];
    for (let i = 0; i <= 3; i++) {
      const date = addDays(today, i);
      const dow = toIst(istDate(date, "12:00")).dow;
      const occ = occupancy((bookings ?? []) as never, staff?.length ?? 0, date, open, close);
      const fest = festivalOn(date);
      report.push({ date, occupancy: Math.round(occ * 100), festival: fest?.name ?? null });
      if (fest && !have.has(`festival|${date}`)) {
        const svc = services[0];
        await db.from("deals").insert({ tenant_id: tenant.id, service_id: svc.id, kind: "festival", discount_pct: 0, slot_start: istDate(date, "10:00").toISOString(), valid_to: istDate(date, "23:59").toISOString(),
          title: `${fest.name} special: ${svc.name}`, description: `High demand expected (surge pricing active, up to +${s.surge_cap_pct}%). Book early to lock today's price.`, created_by: "agent:deals" });
        actions.push({ type: "deal", label: `${fest.name}: surge window on ${date}, early-bird listing published` });
      } else if (!fest && dow >= 1 && dow <= 4 && occ < 0.35 && !have.has(`offpeak|${date}`)) {
        const svc = services[Math.min(1, services.length - 1)];
        const pct = Math.min(s.flash_discount_cap_pct, occ < 0.15 ? 20 : 12);
        await db.from("deals").insert({ tenant_id: tenant.id, service_id: svc.id, kind: "offpeak", discount_pct: pct, slot_start: istDate(date, "11:00").toISOString(), valid_to: istDate(date, "18:00").toISOString(),
          title: `Mid-week flash: ${pct}% off ${svc.name}`, description: `Only ${Math.round(occ * 100)}% booked on ${date} — enjoy ${pct}% off between 11am and 6pm.`, created_by: "agent:deals" });
        actions.push({ type: "deal", label: `Flash ${pct}% off ${svc.name} on ${date} (occupancy ${Math.round(occ * 100)}%)` });
      }
    }
    return { summary: actions.length ? `Published ${actions.length} yield deal(s) to the marketplace.` : "Demand balanced — no new deals needed.", actions, output: report, skipLog: !actions.length };
  },
};
