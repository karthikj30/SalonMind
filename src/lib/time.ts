// All salon operations are in IST (Asia/Kolkata, UTC+05:30, no DST).
export const TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

export function istDate(date: string, time: string): Date {
  return new Date(`${date}T${time.length === 5 ? time + ":00" : time}+05:30`);
}

/** Returns {date:'YYYY-MM-DD', time:'HH:MM', minutes, dow} for a Date in IST. */
export function toIst(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const iso = shifted.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(), // 0 = Sunday
  };
}

export function todayIst(): string {
  return toIst(new Date()).date;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}

export function daysBetween(a: Date | string, b: Date | string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

export const inr = (n: number | string | null | undefined) =>
  // `|| 0` turns -0 (e.g. a negated zero expense) into 0, so it never prints as "₹-0"
  "₹" + (Number(n ?? 0) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Indian festival / wedding-season demand calendar (2026–2027). Multiplier feeds pricing + inventory forecasts. */
export const FESTIVALS: { name: string; from: string; to: string; demand: number }[] = [
  { name: "Diwali", from: "2026-11-05", to: "2026-11-10", demand: 1.6 },
  { name: "Bhai Dooj", from: "2026-11-11", to: "2026-11-11", demand: 1.2 },
  { name: "Wedding season (Nov–Dec)", from: "2026-11-20", to: "2026-12-15", demand: 1.35 },
  { name: "Christmas & New Year", from: "2026-12-24", to: "2027-01-01", demand: 1.3 },
  { name: "Pongal / Sankranti", from: "2027-01-13", to: "2027-01-16", demand: 1.25 },
  { name: "Valentine's week", from: "2027-02-10", to: "2027-02-14", demand: 1.2 },
  { name: "Holi", from: "2027-03-20", to: "2027-03-22", demand: 1.2 },
  { name: "Wedding season (Apr–May)", from: "2027-04-15", to: "2027-05-31", demand: 1.3 },
  { name: "Eid", from: "2027-03-09", to: "2027-03-11", demand: 1.3 },
  { name: "Raksha Bandhan", from: "2027-08-16", to: "2027-08-17", demand: 1.2 },
  { name: "Onam", from: "2027-09-10", to: "2027-09-12", demand: 1.2 },
  { name: "Navratri / Durga Puja", from: "2027-10-01", to: "2027-10-11", demand: 1.4 },
  { name: "Karwa Chauth", from: "2027-10-18", to: "2027-10-18", demand: 1.5 },
  { name: "Diwali", from: "2027-10-26", to: "2027-10-31", demand: 1.6 },
];

export function festivalOn(date: string) {
  return FESTIVALS.find((f) => date >= f.from && date <= f.to) ?? null;
}

export function festivalDemand(fromDate: string, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) total += festivalOn(addDays(fromDate, i))?.demand ?? 1;
  return days ? total / days : 1;
}
