/**
 * Walk-in token queue — wait-time estimates. Pure: given who is waiting (in token order), how long each
 * service takes and when each stylist on duty is busy today, simulate first-come-first-served assignment.
 * It is an estimate for the customer; the real booking is still made by the matrix scheduler when called.
 */
export type Busy = { start: number; end: number }; // minutes since midnight (IST)
export type QueueStaff = { id: string; workStart: number; workEnd: number; busy: Busy[] };
export type Waiting = { id: string; duration: number };
export type Eta = { id: string; position: number; waitMin: number | null; startMin: number | null };

/** Earliest minute ≥ `from` at which the stylist has `duration` free minutes inside working hours. */
function earliestGap(s: QueueStaff, from: number, duration: number): number | null {
  let t = Math.max(from, s.workStart);
  for (const b of [...s.busy].sort((a, c) => a.start - c.start)) {
    if (b.end <= t) continue;
    if (b.start - t >= duration) break;
    t = Math.max(t, b.end);
  }
  return t + duration <= s.workEnd ? t : null;
}

export function estimateWaits(waiting: Waiting[], staff: QueueStaff[], nowMin: number): Eta[] {
  const cal = staff.map((s) => ({ ...s, busy: [...s.busy] }));
  return waiting.map((w, i) => {
    let best: { s: (typeof cal)[number]; t: number } | null = null;
    for (const s of cal) {
      const t = earliestGap(s, nowMin, w.duration);
      if (t !== null && (!best || t < best.t)) best = { s, t };
    }
    if (!best) return { id: w.id, position: i + 1, waitMin: null, startMin: null }; // cannot be served today
    best.s.busy.push({ start: best.t, end: best.t + w.duration });
    return { id: w.id, position: i + 1, waitMin: Math.max(0, best.t - nowMin), startMin: best.t };
  });
}

/** "about 25 min", "about 1 h 10 min", "now" — rounded to 5 minutes so the number does not flicker. */
export function waitLabel(min: number | null): string {
  if (min === null) return "not today — fully booked";
  const m = Math.round(min / 5) * 5;
  if (m <= 0) return "now";
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
