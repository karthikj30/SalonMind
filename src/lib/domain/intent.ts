import { addDays, todayIst, toIst } from "../time.ts";

export type SearchIntent = {
  service: string; maxPrice: number | null; city: string | null;
  date: string | null; fromTime: string | null; toTime: string | null; gender: string | null;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Regex intent parser — used when no LLM is configured, and to sanity-check LLM output. */
export function parseIntent(q: string, cities: string[], now = new Date()): SearchIntent {
  const s = q.toLowerCase();
  const price = s.match(/(?:under|below|less than|within|upto|up to|max|<)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)\s*(k)?/);
  let maxPrice = price ? Number(price[1].replace(/,/g, "")) * (price[2] ? 1000 : 1) : null;
  if (!maxPrice) { const m = s.match(/₹\s*([\d,]+)/); if (m) maxPrice = Number(m[1].replace(/,/g, "")); }
  const city = cities.find((c) => c && s.includes(c.toLowerCase())) ?? null;
  const today = todayIst();
  let date: string | null = null;
  if (/\b(today|tonight|this (evening|morning|afternoon)|now|aaj)\b/.test(s)) date = today;
  else if (/\b(tomorrow|kal)\b/.test(s)) date = addDays(today, 1);
  else if (/\bweekend\b/.test(s)) { const dow = toIst(now).dow; date = addDays(today, (6 - dow + 7) % 7); }
  else { const d = DAYS.findIndex((x) => s.includes(x)); if (d >= 0) { const dow = toIst(now).dow; date = addDays(today, ((d - dow + 7) % 7) || 7); } }
  let fromTime: string | null = null, toTime: string | null = null;
  if (/\b(evening|tonight|after work|shaam)\b/.test(s)) { fromTime = "17:00"; toTime = "21:00"; }
  else if (/\bmorning\b/.test(s)) { fromTime = "09:00"; toTime = "12:00"; }
  else if (/\bafternoon\b/.test(s)) { fromTime = "12:00"; toTime = "17:00"; }
  const at = s.match(/\b(?:at|around)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (at) {
    let h = Number(at[1]); if (at[3] === "pm" && h < 12) h += 12; if (!at[3] && h < 9) h += 12;
    fromTime = `${String(Math.max(0, h - 1)).padStart(2, "0")}:00`; toTime = `${String(Math.min(23, h + 1)).padStart(2, "0")}:00`;
  }
  const gender = /\b(men|male|gents|beard)\b/.test(s) ? "men" : /\b(women|ladies|female|bridal)\b/.test(s) ? "women" : null;
  const service = s
    .replace(/(?:under|below|less than|within|upto|up to|max)\s*(?:rs\.?|inr|₹)?\s*[\d,]+k?/g, " ")
    .replace(/₹\s*[\d,]+/g, " ")
    .replace(/\b(i need|i want|looking for|find|me|a|an|the|nearby|near me|near|that has|has|with|slots?|available|availability|this|evening|morning|afternoon|tonight|today|tomorrow|weekend|in|at|for|salon|please|book|some|good|cheap|best)\b/g, " ")
    .replace(city ? new RegExp(city.toLowerCase(), "g") : /$^/, " ")
    .replace(/\s+/g, " ").trim();
  return { service: service || q, maxPrice, city, date, fromTime, toTime, gender };
}
