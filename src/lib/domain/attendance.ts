/**
 * Staff attendance → payroll. Indian salons mostly keep attendance on paper; here the desk taps "Clock in" and the
 * payroll run counts days present. Salons that never record attendance are unaffected (no loss of pay).
 */
export type AttendanceRow = { staff_id: string; work_date: string; clock_in: string; clock_out: string | null };
export const LATE_GRACE_MIN = 15;

const istMinutes = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Every YYYY-MM-DD from `from` to `to` inclusive. */
export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Days present, late marks, hours, and loss-of-pay days for one stylist over a pay period.
 * Working days = period days up to `today`, minus weekly offs and approved leave.
 */
export function attendanceSummary(p: {
  rows: AttendanceRow[]; from: string; to: string; today: string; workStart: string;
  weeklyOff?: number[]; leaveDates?: string[];
}) {
  const end = p.to < p.today ? p.to : p.today;
  const off = new Set(p.weeklyOff ?? []);
  const leave = new Set(p.leaveDates ?? []);
  const working = end < p.from ? [] : datesBetween(p.from, end).filter((d) => !off.has(new Date(`${d}T00:00:00Z`).getUTCDay()) && !leave.has(d));
  const byDate = new Map(p.rows.map((r) => [r.work_date, r]));
  const present = working.filter((d) => byDate.has(d));
  const late = p.rows.filter((r) => istMinutes(r.clock_in) > toMin(p.workStart) + LATE_GRACE_MIN).length;
  const hours = p.rows.reduce((s, r) => s + (r.clock_out ? (Date.parse(r.clock_out) - Date.parse(r.clock_in)) / 3_600_000 : 0), 0);
  return {
    workingDays: working.length, present: present.length, absent: working.length - present.length,
    leave: leave.size, late, hours: Math.round(hours * 10) / 10,
  };
}

/** Loss of pay: monthly salary ÷ calendar days in the month × absent days (common Indian practice). */
export function lossOfPay(baseSalary: number, absentDays: number, month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round((baseSalary / days) * Math.max(0, absentDays));
}
