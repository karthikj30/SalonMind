import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "../agents/types";
import type { Booking, Room, Service, Staff, TimeOff } from "../domain/types";
import { findSlots, occupancy, type SlotCandidate } from "../domain/scheduling";
import { quotePrice } from "../domain/pricing";
import { istDate, timeToMin, toIst } from "../time";
import { emit } from "../agents/bus";

export async function loadDay(db: SupabaseClient, tenantId: string, date: string) {
  const dayStart = istDate(date, "00:00").toISOString();
  const dayEnd = istDate(date, "23:59").toISOString();
  const [staff, rooms, bookings, timeOff] = await Promise.all([
    db.from("staff").select("*").eq("tenant_id", tenantId).eq("active", true),
    db.from("rooms").select("*").eq("tenant_id", tenantId),
    db.from("bookings").select("*").eq("tenant_id", tenantId).gte("start_at", dayStart).lte("start_at", dayEnd).neq("status", "cancelled"),
    db.from("staff_time_off").select("staff_id, start_at, end_at").eq("tenant_id", tenantId).lte("start_at", dayEnd).gte("end_at", dayStart),
  ]);
  return { staff: (staff.data ?? []) as Staff[], rooms: (rooms.data ?? []) as Room[], bookings: (bookings.data ?? []) as Booking[], timeOff: (timeOff.data ?? []) as TimeOff[] };
}

export function priceFn(tenant: Tenant, service: Service, bookings: Booking[], staffCount: number) {
  return (start: Date) => {
    const ist = toIst(start);
    const band = Math.floor(ist.minutes / 180) * 180; // 3-hour demand bands
    const occ = occupancy(bookings, staffCount, ist.date, Math.max(band, timeToMin(tenant.open_time.slice(0, 5))), band + 180);
    return quotePrice(Number(service.base_price), start, occ, tenant.settings);
  };
}

export async function planBooking(db: SupabaseClient, tenant: Tenant, p: {
  service_id: string; date: string; from?: string | null; to?: string | null; staff_id?: string | null; excludeBookingId?: string | null;
}, limit = 5): Promise<{ service: Service; slots: (SlotCandidate & { quote: ReturnType<ReturnType<typeof priceFn>> })[] }> {
  const { data: service } = await db.from("services").select("*").eq("id", p.service_id).eq("tenant_id", tenant.id).single();
  if (!service) throw new Error("Service not found");
  const day = await loadDay(db, tenant.id, p.date);
  if (p.excludeBookingId) day.bookings = day.bookings.filter((b) => b.id !== p.excludeBookingId);
  const pf = priceFn(tenant, service as Service, day.bookings, day.staff.length);
  const slots = findSlots({
    service: service as Service, date: p.date, preferredFrom: p.from || undefined, preferredTo: p.to || undefined,
    preferredStaffId: p.staff_id || null, staff: day.staff, rooms: day.rooms, bookings: day.bookings, timeOff: day.timeOff,
    openTime: tenant.open_time, closeTime: tenant.close_time, priceFor: (d) => pf(d).price,
  }, limit);
  return { service: service as Service, slots: slots.map((s) => ({ ...s, quote: pf(s.start) })) };
}

export async function findOrCreateClient(db: SupabaseClient, tenantId: string, c: { name: string; phone?: string | null; email?: string | null; language?: string | null }) {
  const phone = c.phone?.replace(/\s+/g, "") || null;
  if (phone) {
    const { data } = await db.from("clients").select("*").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
    if (data) return data;
  }
  const { data, error } = await db.from("clients").insert({
    tenant_id: tenantId, name: c.name || "Guest", phone, email: c.email || null, language: c.language || "en",
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Book via the matrix scheduler. If an explicit time is given, we pick the best stylist/room at exactly
 * that time; otherwise the best-scored slot of the day (within the preferred window).
 */
export async function createBooking(db: SupabaseClient, tenant: Tenant, p: {
  client_id: string; service_id: string; date: string; time?: string | null; from?: string | null; to?: string | null;
  staff_id?: string | null; source: string;
}) {
  const window = p.time ? { from: p.time, to: p.time } : { from: p.from, to: p.to };
  const plan = await planBooking(db, tenant, { service_id: p.service_id, date: p.date, staff_id: p.staff_id, ...window }, 1);
  const best = plan.slots[0];
  if (!best) throw new Error(p.time ? `No stylist/room free at ${p.time} on ${p.date} for ${plan.service.name}` : `No free slot on ${p.date} for ${plan.service.name}`);
  const { data, error } = await db.from("bookings").insert({
    tenant_id: tenant.id, client_id: p.client_id, service_id: p.service_id, staff_id: best.staff.id, room_id: best.room?.id ?? null,
    start_at: best.start.toISOString(), end_at: best.end.toISOString(), status: "booked",
    base_price: plan.service.base_price, price: best.quote.price, pricing_note: best.quote.note, source: p.source,
    schedule_reasoning: `${best.staff.name}: ${best.reasons.join(" · ")}`,
  }).select("*").single();
  if (error) throw new Error(error.message);
  await emit(db, tenant.id, "booking.created", { booking_id: data.id }, "scheduler");
  return { booking: data, slot: best, service: plan.service };
}

/** Move a booking to a new date/time through the scheduler (re-checks skill, room, leave, overlaps; re-prices). */
export async function rescheduleBooking(db: SupabaseClient, tenant: Tenant, bookingId: string, date: string, time: string) {
  const { data: b } = await db.from("bookings").select("*").eq("id", bookingId).eq("tenant_id", tenant.id).single();
  if (!b) throw new Error("Booking not found");
  if (!["booked", "confirmed"].includes(b.status)) throw new Error(`Cannot reschedule a ${b.status} booking`);
  const plan = await planBooking(db, tenant, { service_id: b.service_id, date, from: time, to: time, excludeBookingId: b.id }, 1);
  const best = plan.slots.find((s) => s.staff.id === b.staff_id) ?? plan.slots[0];
  if (!best) throw new Error(`No stylist/room free at ${time} on ${date}`);
  const { data, error } = await db.from("bookings").update({
    start_at: best.start.toISOString(), end_at: best.end.toISOString(), staff_id: best.staff.id, room_id: best.room?.id ?? null,
    price: best.quote.price, pricing_note: best.quote.note, rescheduled_from: b.start_at, no_show_risk: null,
    schedule_reasoning: `Rescheduled → ${best.staff.name}: ${best.reasons.join(" · ")}`,
  }).eq("id", b.id).select("*").single();
  if (error) throw new Error(error.message);
  await emit(db, tenant.id, "booking.cancelled", { booking_id: b.id, freed_start: b.start_at, freed_end: b.end_at, service_id: b.service_id, reason: "rescheduled" }, "scheduler");
  await emit(db, tenant.id, "booking.created", { booking_id: b.id }, "scheduler");
  return { booking: data, slot: best };
}

/**
 * Import a past visit (migrating from another system / paper register). Recorded as a completed,
 * historical booking — no invoice, no stock movement — so agents can learn visit cycles immediately.
 */
export async function logPastVisit(db: SupabaseClient, tenant: Tenant, p: {
  client_id: string; service_id: string; staff_id?: string | null; date: string; time?: string | null; price?: number | null; rating?: number | null; review?: string | null;
}) {
  if (p.date >= toIst(new Date()).date) throw new Error("Past visits must be dated before today");
  const { data: svc } = await db.from("services").select("duration_min, base_price").eq("id", p.service_id).single();
  if (!svc) throw new Error("Service not found");
  const start = istDate(p.date, p.time || "12:00");
  const { data, error } = await db.from("bookings").insert({
    tenant_id: tenant.id, client_id: p.client_id, service_id: p.service_id, staff_id: p.staff_id || null,
    start_at: start.toISOString(), end_at: new Date(start.getTime() + svc.duration_min * 60000).toISOString(),
    status: "completed", base_price: svc.base_price, price: p.price ?? svc.base_price, pricing_note: "historical import",
    source: "import", is_historical: true, rating: p.rating || null, review: p.review || null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (p.review || p.rating) await emit(db, tenant.id, "booking.reviewed", { booking_id: data.id }, "import");
  else await emit(db, tenant.id, "booking.completed.historical", { booking_id: data.id }, "import");
  return data.id as string;
}
