import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "../agents/types";
import type { Booking, Room, Service, Staff } from "../domain/types";
import { findSlots, occupancy, type SlotCandidate } from "../domain/scheduling";
import { quotePrice } from "../domain/pricing";
import { istDate, timeToMin, toIst } from "../time";
import { emit } from "../agents/bus";

export async function loadDay(db: SupabaseClient, tenantId: string, date: string) {
  const dayStart = istDate(date, "00:00").toISOString();
  const dayEnd = istDate(date, "23:59").toISOString();
  const [staff, rooms, bookings] = await Promise.all([
    db.from("staff").select("*").eq("tenant_id", tenantId).eq("active", true),
    db.from("rooms").select("*").eq("tenant_id", tenantId),
    db.from("bookings").select("*").eq("tenant_id", tenantId).gte("start_at", dayStart).lte("start_at", dayEnd).neq("status", "cancelled"),
  ]);
  return { staff: (staff.data ?? []) as Staff[], rooms: (rooms.data ?? []) as Room[], bookings: (bookings.data ?? []) as Booking[] };
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
  service_id: string; date: string; from?: string | null; to?: string | null; staff_id?: string | null;
}, limit = 5): Promise<{ service: Service; slots: (SlotCandidate & { quote: ReturnType<ReturnType<typeof priceFn>> })[] }> {
  const { data: service } = await db.from("services").select("*").eq("id", p.service_id).eq("tenant_id", tenant.id).single();
  if (!service) throw new Error("Service not found");
  const day = await loadDay(db, tenant.id, p.date);
  const pf = priceFn(tenant, service as Service, day.bookings, day.staff.length);
  const slots = findSlots({
    service: service as Service, date: p.date, preferredFrom: p.from || undefined, preferredTo: p.to || undefined,
    preferredStaffId: p.staff_id || null, staff: day.staff, rooms: day.rooms, bookings: day.bookings,
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
