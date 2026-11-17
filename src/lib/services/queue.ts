import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "../agents/types";
import { emit } from "../agents/bus";
import { estimateWaits, type Eta, type QueueStaff } from "../domain/queue";
import { istDate, minToTime, timeToMin, todayIst, toIst, addDays } from "../time";
import { createBooking, findOrCreateClient, planBooking } from "./booking";

export type Walkin = {
  id: string; token_no: number; name: string; phone: string | null; service_id: string | null; status: "waiting" | "serving" | "done" | "left";
  source: string; booking_id: string | null; created_at: string; services: { name: string; duration_min: number } | null;
};
export type QueueState = { waiting: (Walkin & { eta: Eta })[]; serving: Walkin[]; doneToday: number; nowServing: number | null };

/** Today's queue with a wait estimate for everyone waiting (simulated against the stylists' real calendar). */
export async function queueState(db: SupabaseClient, tenant: Tenant): Promise<QueueState> {
  const today = todayIst();
  const dayStart = istDate(today, "00:00").toISOString(), dayEnd = istDate(addDays(today, 1), "00:00").toISOString();
  const [{ data: rows }, { data: staff }, { data: bookings }, { data: off }] = await Promise.all([
    db.from("walkins").select("*, services(name, duration_min)").eq("tenant_id", tenant.id).eq("queue_date", today).order("token_no"),
    db.from("staff").select("id, work_start, work_end").eq("tenant_id", tenant.id).eq("active", true),
    db.from("bookings").select("id, staff_id, start_at, end_at, status").eq("tenant_id", tenant.id).gte("start_at", dayStart).lt("start_at", dayEnd).not("status", "in", "(cancelled,no_show)"),
    db.from("staff_time_off").select("staff_id, start_at, end_at").eq("tenant_id", tenant.id).lt("start_at", dayEnd).gt("end_at", dayStart),
  ]);
  const all = (rows ?? []) as Walkin[];
  const byBooking = new Map((bookings ?? []).map((b) => [b.id, b.status]));
  // a served walk-in is finished once its booking is completed (or was cancelled)
  const serving = all.filter((w) => w.status === "serving" && (!w.booking_id || ["booked", "confirmed"].includes(byBooking.get(w.booking_id) ?? "")));
  const waiting = all.filter((w) => w.status === "waiting");
  const mins = (iso: string) => { const t = toIst(new Date(iso)); return t.date < today ? 0 : t.date > today ? 1440 : t.minutes; };
  const cal: QueueStaff[] = (staff ?? []).map((s) => ({
    id: s.id, workStart: timeToMin(String(s.work_start).slice(0, 5)), workEnd: timeToMin(String(s.work_end).slice(0, 5)),
    busy: [...(bookings ?? []).filter((b) => b.staff_id === s.id && b.status !== "completed"), ...(off ?? []).filter((o) => o.staff_id === s.id)].map((b) => ({ start: mins(b.start_at), end: mins(b.end_at) })),
  }));
  const etas = estimateWaits(waiting.map((w) => ({ id: w.id, duration: w.services?.duration_min ?? 30 })), cal, toIst(new Date()).minutes);
  return {
    waiting: waiting.map((w, i) => ({ ...w, eta: etas[i] })), serving,
    doneToday: all.filter((w) => w.status === "done" || (w.status === "serving" && !serving.includes(w))).length,
    nowServing: serving.length ? Math.max(...serving.map((w) => w.token_no)) : null,
  };
}

/** Add someone to today's queue; the token number is the next free one (unique per salon per day). */
export async function joinQueue(db: SupabaseClient, tenant: Tenant, p: { name: string; phone?: string | null; service_id?: string | null; source: "desk" | "qr" }) {
  const name = p.name.trim().slice(0, 80);
  if (!name) throw new Error("Please enter a name.");
  const today = todayIst();
  const phone = p.phone?.replace(/[^\d+]/g, "").slice(0, 16) || null;
  if (phone) {
    const { data: dup } = await db.from("walkins").select("id, token_no").eq("tenant_id", tenant.id).eq("queue_date", today).eq("phone", phone).eq("status", "waiting").maybeSingle();
    if (dup) return dup as { id: string; token_no: number }; // already in the queue: give the same token back
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: last } = await db.from("walkins").select("token_no").eq("tenant_id", tenant.id).eq("queue_date", today).order("token_no", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db.from("walkins").insert({ tenant_id: tenant.id, queue_date: today, token_no: (last?.token_no ?? 0) + 1, name, phone, service_id: p.service_id || null, source: p.source }).select("id, token_no").single();
    if (!error) return data as { id: string; token_no: number };
    if (error.code !== "23505") throw new Error(error.message); // 23505 = someone took that token a moment ago → retry
  }
  throw new Error("The queue is busy — please try again.");
}

/**
 * Seat a waiting customer: the matrix scheduler finds the earliest stylist + room from now, a normal booking is
 * created (so billing, inventory and loyalty work as usual) and the Queue Agent is told the line moved.
 */
export async function callWalkin(db: SupabaseClient, tenant: Tenant, id: string) {
  const { data: w } = await db.from("walkins").select("*").eq("id", id).eq("tenant_id", tenant.id).single();
  if (!w || w.status !== "waiting") throw new Error("That token is no longer waiting.");
  if (!w.service_id) throw new Error("Choose a service for this walk-in first.");
  const now = toIst(new Date());
  const from = minToTime(Math.min(Math.ceil(now.minutes / 5) * 5, 23 * 60 + 55));
  if (from >= tenant.close_time.slice(0, 5)) throw new Error("The salon is closed — no stylist is free for the rest of today.");
  const plan = await planBooking(db, tenant, { service_id: w.service_id, date: now.date, from, to: tenant.close_time.slice(0, 5) }, 12);
  // only slots from now on: after closing time the scheduler would otherwise offer times earlier today
  const first = plan.slots.filter((x) => x.start.getTime() >= Date.now() - 5 * 60_000).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (!first) throw new Error(`No stylist or room is free for ${plan.service.name} for the rest of today.`);
  const client = await findOrCreateClient(db, tenant.id, { name: w.name, phone: w.phone });
  const { booking } = await createBooking(db, tenant, { client_id: client.id, service_id: w.service_id, date: now.date, time: toIst(first.start).time, staff_id: first.staff.id, source: "walkin" });
  await db.from("walkins").update({ status: "serving", booking_id: booking.id, called_at: new Date().toISOString() }).eq("id", id);
  await emit(db, tenant.id, "queue.advanced", { token_no: w.token_no }, "front-desk");
  return { token_no: w.token_no as number, stylist: first.staff.name, time: toIst(first.start).time, service: plan.service.name };
}

export async function leaveQueue(db: SupabaseClient, tenant: Tenant, id: string) {
  await db.from("walkins").update({ status: "left" }).eq("id", id).eq("tenant_id", tenant.id).eq("status", "waiting");
  await emit(db, tenant.id, "queue.advanced", { left: id }, "front-desk");
}
