import type { Booking, Room, Service, Staff } from "./types.ts";
import { istDate, minToTime, timeToMin, toIst } from "../time.ts";

/**
 * Dynamic matrix scheduler. For a requested service + day (+ optional preferred window) it enumerates
 * every (start-time × stylist × room) combination, discards infeasible ones (skill, working hours,
 * double-booking, equipment), and scores the rest on: contribution margin, skill fit, load-balancing
 * and closeness to the client's preferred time. Pure function → unit tested.
 */
export type SlotCandidate = {
  start: Date; end: Date; staff: Staff; room: Room | null; score: number;
  margin: number; reasons: string[];
};

export type ScheduleInput = {
  service: Service;
  date: string; // YYYY-MM-DD (IST)
  preferredFrom?: string; // HH:MM
  preferredTo?: string;
  preferredStaffId?: string | null;
  staff: Staff[];
  rooms: Room[];
  bookings: Booking[]; // existing bookings that day (any status except cancelled)
  openTime: string;
  closeTime: string;
  priceFor?: (start: Date) => number;
  stepMin?: number;
  now?: Date;
};

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function findSlots(inp: ScheduleInput, limit = 5): SlotCandidate[] {
  const step = inp.stepMin ?? 30;
  const dur = inp.service.duration_min;
  const now = (inp.now ?? new Date()).getTime();
  const active = inp.bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const open = timeToMin(inp.openTime.slice(0, 5));
  const close = timeToMin(inp.closeTime.slice(0, 5));
  const prefFrom = inp.preferredFrom ? timeToMin(inp.preferredFrom) : null;
  const prefTo = inp.preferredTo ? timeToMin(inp.preferredTo) : null;

  const eligibleStaff = inp.staff.filter(
    (s) =>
      s.active &&
      s.skill_level >= inp.service.min_skill_level &&
      (!inp.preferredStaffId || s.id === inp.preferredStaffId),
  );
  const needEq = inp.service.required_equipment ?? [];
  const eligibleRooms = inp.rooms.filter((r) => needEq.every((e) => r.equipment.includes(e)));
  const roomOptions: (Room | null)[] = inp.rooms.length === 0 && needEq.length === 0 ? [null] : eligibleRooms;

  // load per stylist that day (minutes booked) for balancing
  const load = new Map<string, number>();
  active.forEach((b) => {
    if (b.staff_id) load.set(b.staff_id, (load.get(b.staff_id) ?? 0) + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000);
  });

  const out: SlotCandidate[] = [];
  for (let m = open; m + dur <= close; m += step) {
    if (prefFrom !== null && m < prefFrom) continue;
    if (prefTo !== null && m > prefTo) continue;
    const start = istDate(inp.date, minToTime(m));
    if (start.getTime() < now) continue;
    const end = new Date(start.getTime() + dur * 60000);
    const sMs = start.getTime(), eMs = end.getTime();

    for (const st of eligibleStaff) {
      if (m < timeToMin(st.work_start.slice(0, 5)) || m + dur > timeToMin(st.work_end.slice(0, 5))) continue;
      const busy = active.some((b) => b.staff_id === st.id && overlaps(sMs, eMs, +new Date(b.start_at), +new Date(b.end_at)));
      if (busy) continue;
      for (const room of roomOptions) {
        if (room && active.some((b) => b.room_id === room.id && overlaps(sMs, eMs, +new Date(b.start_at), +new Date(b.end_at)))) continue;
        const price = inp.priceFor ? inp.priceFor(start) : inp.service.base_price;
        const labour = (st.hourly_cost * dur) / 60;
        const margin = price - labour;
        const reasons: string[] = [];
        let score = margin / Math.max(1, inp.service.base_price); // margin ratio ~0..1
        const over = st.skill_level - inp.service.min_skill_level;
        score -= over * 0.05; // don't burn a level-5 artist on a level-1 service
        reasons.push(`skill L${st.skill_level} ≥ L${inp.service.min_skill_level}`);
        if (st.skills.some((k) => k.toLowerCase() === inp.service.category.toLowerCase() || inp.service.name.toLowerCase().includes(k.toLowerCase()))) {
          score += 0.15;
          reasons.push(`specialises in ${inp.service.category}`);
        }
        const l = load.get(st.id) ?? 0;
        score -= (l / 600) * 0.2;
        if (l < 120) reasons.push("light schedule today");
        if (prefFrom !== null) score -= (Math.abs(m - prefFrom) / 600) * 0.3;
        if (room) reasons.push(`room ${room.name}${needEq.length ? " has " + needEq.join(", ") : ""}`);
        reasons.push(`margin ₹${Math.round(margin)}`);
        out.push({ start, end, staff: st, room, score, margin, reasons });
      }
    }
  }
  out.sort((a, b) => b.score - a.score || a.start.getTime() - b.start.getTime());
  // keep the best per start time to show diverse options
  const seen = new Set<number>();
  const diverse: SlotCandidate[] = [];
  for (const c of out) {
    if (seen.has(c.start.getTime())) continue;
    seen.add(c.start.getTime());
    diverse.push(c);
    if (diverse.length >= limit) break;
  }
  return diverse;
}

/** Occupancy (0..1) of stylist capacity for a given IST date & hour band. */
export function occupancy(bookings: Booking[], staffCount: number, date: string, fromMin: number, toMin: number): number {
  if (!staffCount) return 0;
  const cap = staffCount * (toMin - fromMin);
  let used = 0;
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const s = toIst(new Date(b.start_at)), e = toIst(new Date(b.end_at));
    if (s.date !== date) continue;
    used += Math.max(0, Math.min(e.minutes, toMin) - Math.max(s.minutes, fromMin));
  }
  return Math.min(1, used / cap);
}
