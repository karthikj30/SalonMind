import type { TenantSettings } from "./types.ts";
import { festivalOn, toIst } from "../time.ts";

/**
 * Yield-management pricing. Price multiplier from: occupancy of the slot's day-band, Indian festival
 * calendar, weekend/evening demand, and lead time. Capped by tenant settings (surge cap / discount cap).
 */
export function quotePrice(
  basePrice: number,
  start: Date,
  occ: number,
  settings: Pick<TenantSettings, "surge_cap_pct" | "flash_discount_cap_pct">,
  now: Date = new Date(),
): { price: number; multiplier: number; note: string } {
  const ist = toIst(start);
  const fest = festivalOn(ist.date);
  const weekend = ist.dow === 0 || ist.dow === 6;
  const evening = ist.minutes >= 17 * 60;
  const hoursAhead = (start.getTime() - now.getTime()) / 3_600_000;
  let mult = 1;
  const notes: string[] = [];
  if (fest) { mult += (fest.demand - 1) * 0.5; notes.push(`${fest.name} demand`); }
  if (weekend) { mult += 0.08; notes.push("weekend"); }
  if (evening) { mult += 0.04; notes.push("evening peak"); }
  if (occ > 0.75) { mult += 0.1; notes.push(`high occupancy ${(occ * 100).toFixed(0)}%`); }
  if (!weekend && !fest && !evening && occ < 0.3) {
    const d = hoursAhead < 24 ? 0.15 : 0.08;
    mult -= d;
    notes.push(`off-peak slot (${(occ * 100).toFixed(0)}% booked)`);
  }
  const maxM = 1 + settings.surge_cap_pct / 100, minM = 1 - settings.flash_discount_cap_pct / 100;
  mult = Math.min(maxM, Math.max(minM, mult));
  const price = Math.round((basePrice * mult) / 10) * 10;
  const pct = Math.round((mult - 1) * 100);
  return { price, multiplier: mult, note: pct === 0 ? "standard price" : `${pct > 0 ? "+" : ""}${pct}% · ${notes.join(", ")}` };
}
