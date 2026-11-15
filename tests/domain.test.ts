import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvoice, buildReturns, invoiceNumber, financialYear, splitPayout } from "../src/lib/domain/gst.ts";
import { slabCommission, payrollLine } from "../src/lib/domain/payroll.ts";
import { findSlots } from "../src/lib/domain/scheduling.ts";
import { quotePrice } from "../src/lib/domain/pricing.ts";
import { noShowRisk } from "../src/lib/domain/noshow.ts";
import { forecastProduct, tierDiscount } from "../src/lib/domain/forecast.ts";
import { churnRisk, visitCycle, lexiconSentiment } from "../src/lib/domain/crm.ts";
import { parseIntent } from "../src/lib/domain/intent.ts";
import { istDate, toIst } from "../src/lib/time.ts";

test("GST: intra-state service splits 9% CGST + 9% SGST", () => {
  const inv = computeInvoice([{ description: "Haircut", kind: "service", code: "999721", qty: 1, rate: 18, unit_price: 1000 }], "27", "27");
  assert.equal(inv.cgst, 90); assert.equal(inv.sgst, 90); assert.equal(inv.igst, 0); assert.equal(inv.total, 1180);
});

test("GST: inter-state → IGST", () => {
  const inv = computeInvoice([{ description: "Serum", kind: "product", code: "3305", qty: 2, rate: 18, unit_price: 500 }], "27", "29");
  assert.equal(inv.igst, 180); assert.equal(inv.cgst, 0); assert.equal(inv.total, 1180);
});

test("GST: FY numbering", () => {
  assert.equal(financialYear(new Date("2026-03-31T00:00:00Z")), "2025-26");
  assert.equal(financialYear(new Date("2026-04-01T00:00:00Z")), "2026-27");
  assert.equal(invoiceNumber("GLOW", new Date("2026-11-15T00:00:00Z"), 7), "GLOW/2026-27/0007");
});

test("GST: GSTR-3B uses ITC (IGST first) and computes cash payable", () => {
  const inv = computeInvoice([{ description: "Colour", kind: "service", code: "999721", qty: 1, rate: 18, unit_price: 10000 }], "27", "27");
  const r = buildReturns([{ number: "A/1", invoice_date: "2026-11-01", place_of_supply: "27", ...inv }] as never, [{ subtotal: 5000, gst_amount: 900, is_interstate: true }]);
  // output CGST 900 + SGST 900; IGST credit 900 → used against CGST first
  assert.equal(r.gstr3b.tax_payable_cash.cgst, 0);
  assert.equal(r.gstr3b.tax_payable_cash.sgst, 900);
  assert.equal(r.gstr1.docs.count, 1);
});

test("Split payout routes booth-renter share and tax bucket", () => {
  const sp = splitPayout({ taxable_value: 1000, cgst: 90, sgst: 90, igst: 0, total: 1180 }, "upi", { name: "Asha", booth_rent_pct: 30 });
  assert.equal(sp.tax_bucket, 180); assert.equal(sp.gateway_fee, 0);
  assert.equal(sp.booth_renter!.amount, 700); assert.equal(sp.salon_owner, 300);
});

test("Payroll: progressive slabs", () => {
  const slabs = [{ upto: 50000, pct: 10 }, { upto: 150000, pct: 15 }, { upto: null, pct: 20 }];
  assert.equal(slabCommission(40000, slabs).amount, 4000);
  assert.equal(slabCommission(100000, slabs).amount, 5000 + 7500);
  assert.equal(slabCommission(200000, slabs).amount, 5000 + 15000 + 10000);
  assert.equal(slabCommission(100000, slabs, "flat").amount, 15000);
});

const staffA = { id: "a", name: "Asha", role: "stylist", skill_level: 5, skills: ["colour"], employment_type: "employee" as const, booth_rent_pct: 0, base_salary: 20000, commission_slabs: [{ upto: null, pct: 10 }], product_commission_pct: 5, hourly_cost: 400, work_start: "10:00", work_end: "20:00", active: true };
const staffB = { ...staffA, id: "b", name: "Ravi", skill_level: 2, skills: ["hair"], hourly_cost: 150 };
const svc = { id: "s", tenant_id: "t", name: "Balayage", category: "colour", duration_min: 120, base_price: 4000, min_skill_level: 4, required_equipment: ["wash basin"], active: true };

test("Payroll: booth renter gets revenue share; tips and penalties", () => {
  const l = payrollLine({ ...staffA, employment_type: "booth_renter", booth_rent_pct: 30 }, 10000, 0, 500, 200, 0);
  assert.equal(l.booth_payout, 7000); assert.equal(l.net, 7300);
});

test("Scheduler: enforces skill, equipment and no double booking", () => {
  const date = "2030-01-08";
  const rooms = [{ id: "r1", name: "Chair", type: "chair", equipment: [] }, { id: "r2", name: "Colour bay", type: "colour", equipment: ["wash basin"] }];
  const busy = [{ id: "x", client_id: null, service_id: null, staff_id: "a", room_id: "r2", start_at: istDate(date, "10:00").toISOString(), end_at: istDate(date, "12:00").toISOString(), status: "booked", price: 0, base_price: 0 }];
  const slots = findSlots({ service: svc, date, staff: [staffA, staffB], rooms, bookings: busy, openTime: "10:00", closeTime: "20:00", now: new Date("2029-01-01") }, 50);
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.equal(s.staff.id, "a", "only L5 stylist qualifies");
    assert.equal(s.room?.id, "r2", "needs wash basin");
    assert.ok(s.start >= new Date(istDate(date, "12:00")), "no overlap with existing booking");
  }
});

test("Scheduler: honours preferred window", () => {
  const slots = findSlots({ service: { ...svc, min_skill_level: 1, required_equipment: [] }, date: "2030-01-08", preferredFrom: "17:00", preferredTo: "18:00", staff: [staffA, staffB], rooms: [], bookings: [], openTime: "10:00", closeTime: "20:00", now: new Date("2029-01-01") });
  assert.ok(slots.every((s) => toIst(s.start).minutes >= 17 * 60 && toIst(s.start).minutes <= 18 * 60));
});

test("Pricing: festival surge capped, off-peak discount", () => {
  const diwali = quotePrice(1000, istDate("2026-11-07", "18:00"), 0.9, { surge_cap_pct: 25, flash_discount_cap_pct: 20 }, new Date("2026-11-01"));
  assert.ok(diwali.price > 1000 && diwali.price <= 1250);
  const tue = quotePrice(1000, istDate("2027-06-15", "12:00"), 0.1, { surge_cap_pct: 25, flash_discount_cap_pct: 20 }, new Date("2027-06-15T03:00:00Z"));
  assert.ok(tue.price < 1000 && tue.price >= 800);
});

test("No-show: history raises risk; deposit lowers it", () => {
  const base = { pastBookings: 4, pastNoShows: 0, leadHours: 48, hour: 14, depositPaid: 0, source: "walkin" };
  const flaky = noShowRisk({ ...base, pastNoShows: 2 }).risk;
  assert.ok(flaky > noShowRisk(base).risk);
  assert.ok(noShowRisk({ ...base, pastNoShows: 2, depositPaid: 500 }).risk < flaky);
});

test("Forecast: festival demand triggers reorder", () => {
  const f = forecastProduct({ stock_qty: 500, reorder_level: 100, lead_time_days: 5, usedLast30: 1500, historyDays: 30, upcomingQty: 0, upcomingDays: 14 }, 3, "2026-11-20");
  assert.ok(f.needs); assert.ok(f.qty > 0); assert.ok(f.seasonal > 1);
  assert.equal(tierDiscount([{ min_qty: 10, discount_pct: 5 }, { min_qty: 50, discount_pct: 10 }], 60), 10);
});

test("CRM: 4-week client overdue at week 6 is at risk", () => {
  const d = (s: string) => new Date(s);
  const cyc = visitCycle([d("2026-08-01"), d("2026-08-29"), d("2026-09-26")]);
  assert.equal(Math.round(cyc.avg), 28);
  assert.ok(churnRisk({ daysSinceLast: 42, avgCycle: cyc.avg, lastGap: cyc.lastGap, sentiment: null, noShows: 0, visits: 3 }).risk > churnRisk({ daysSinceLast: 20, avgCycle: cyc.avg, lastGap: cyc.lastGap, sentiment: null, noShows: 0, visits: 3 }).risk);
  assert.ok(lexiconSentiment("worst service, rude staff") < 0);
  assert.ok(lexiconSentiment("bahut badhiya, loved it") > 0);
});

test("Intent parser: RFP example query", () => {
  const i = parseIntent("I need a balayage haircut under ₹3000 nearby that has slots available this evening", ["Mumbai"]);
  assert.equal(i.maxPrice, 3000); assert.equal(i.fromTime, "17:00"); assert.ok(i.service.includes("balayage")); assert.ok(i.date);
});
