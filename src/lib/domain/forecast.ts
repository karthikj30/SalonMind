import { festivalDemand } from "../time.ts";

/**
 * Predictive stock refilling: blends historical consumption with consumption implied by upcoming
 * bookings, scales by festival/wedding-season demand over the horizon, and recommends an order quantity
 * covering lead time + safety buffer + 14 days.
 */
export function forecastProduct(p: {
  stock_qty: number; reorder_level: number; lead_time_days: number;
  usedLast30: number; historyDays: number; upcomingQty: number; upcomingDays: number;
}, bufferDays: number, today: string) {
  const histDaily = p.historyDays > 0 ? p.usedLast30 / Math.min(30, Math.max(1, p.historyDays)) : 0;
  const upDaily = p.upcomingDays > 0 ? p.upcomingQty / p.upcomingDays : 0;
  const horizon = p.lead_time_days + bufferDays + 14;
  const seasonal = festivalDemand(today, horizon);
  const daily = Math.max(histDaily, upDaily) * seasonal;
  const daysLeft = daily > 0 ? p.stock_qty / daily : Infinity;
  const needs = p.stock_qty <= p.reorder_level || daysLeft < p.lead_time_days + bufferDays;
  const qty = needs ? Math.max(Math.ceil(daily * horizon - p.stock_qty), Math.ceil(p.reorder_level * 2 - p.stock_qty), 1) : 0;
  return { daily: Math.round(daily * 100) / 100, daysLeft: daysLeft === Infinity ? null : Math.round(daysLeft * 10) / 10, seasonal: Math.round(seasonal * 100) / 100, needs, qty };
}

export function tierDiscount(tiers: { min_qty: number; discount_pct: number }[], qty: number) {
  return [...tiers].sort((a, b) => b.min_qty - a.min_qty).find((t) => qty >= t.min_qty)?.discount_pct ?? 0;
}
