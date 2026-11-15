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

import { checkoutPricing, pointsEarned, walletSplit, matchWaitlist, daysToBirthday } from "../src/lib/domain/loyalty.ts";

test("Scheduler: staff on leave are never offered", () => {
  const date = "2030-01-08";
  const slots = findSlots({ service: { ...svc, min_skill_level: 1, required_equipment: [] }, date, staff: [staffA, staffB], rooms: [],
    bookings: [], timeOff: [{ staff_id: "a", start_at: istDate(date, "00:00").toISOString(), end_at: istDate(date, "23:59").toISOString() }],
    openTime: "10:00", closeTime: "20:00", now: new Date("2029-01-01") }, 50);
  assert.ok(slots.length > 0 && slots.every((s) => s.staff.id === "b"));
});

test("Checkout: membership discount then points (capped) reduce taxable value", () => {
  const r = checkoutPricing({ servicePrice: 2000, membershipPct: 20, pointsBalance: 5000, redeemPoints: true, maxRedeemPct: 50 });
  assert.equal(r.membershipDiscount, 400); assert.equal(r.pointsUsed, 800); assert.equal(r.taxableService, 800);
  assert.equal(checkoutPricing({ servicePrice: 1000, membershipPct: 0, pointsBalance: 120, redeemPoints: true, maxRedeemPct: 50 }).pointsUsed, 120);
  assert.equal(checkoutPricing({ servicePrice: 1000, membershipPct: 0, pointsBalance: 120, redeemPoints: false, maxRedeemPct: 50 }).taxableService, 1000);
});

test("Loyalty earn + wallet split", () => {
  assert.equal(pointsEarned(1180, 1), 11);
  assert.deepEqual(walletSplit(1180, 500, true), { fromWallet: 500, remaining: 680 });
  assert.deepEqual(walletSplit(300, 500, true), { fromWallet: 300, remaining: 0 });
  assert.deepEqual(walletSplit(300, 500, false), { fromWallet: 0, remaining: 300 });
});

test("Waitlist: FIFO match on service, date and window", () => {
  const e = (id: string, o: Partial<{ date: string | null; from_time: string | null; to_time: string | null; service_id: string }>, at: string) =>
    ({ id, service_id: "s", date: null, from_time: null, to_time: null, status: "waiting", created_at: at, ...o });
  const m = matchWaitlist([
    e("late", {}, "2026-11-02"), e("early", { date: "2026-11-20" }, "2026-11-01"),
    e("wrongday", { date: "2026-11-21" }, "2026-10-01"), e("morningonly", { to_time: "12:00" }, "2026-10-01"), e("othersvc", { service_id: "x" }, "2026-10-01"),
  ], { service_id: "s", date: "2026-11-20", time: "17:00" });
  assert.deepEqual(m.map((x) => x.id), ["early", "late"]);
});

test("Birthday countdown wraps the year", () => {
  assert.equal(daysToBirthday("1995-11-20", "2026-11-15"), 5);
  assert.equal(daysToBirthday("1995-01-02", "2026-12-30"), 3);
});

test("Scheduler: plain services don't tie up specialist rooms", () => {
  const rooms = [{ id: "bay", name: "Colour bay", type: "colour", equipment: ["wash basin", "steamer"] }, { id: "chair", name: "Chair", type: "chair", equipment: [] }];
  const slots = findSlots({ service: { ...svc, min_skill_level: 1, required_equipment: [] }, date: "2030-01-08", staff: [staffB], rooms, bookings: [], openTime: "10:00", closeTime: "20:00", now: new Date("2029-01-01") });
  assert.ok(slots.length && slots.every((s) => s.room?.id === "chair"));
});

import { upiLink } from "../src/lib/domain/upi.ts";
import { statutory, professionalTax } from "../src/lib/domain/statutory.ts";
import { parseCsv, mapClientRows } from "../src/lib/domain/csv.ts";
import { buildIcs } from "../src/lib/domain/ics.ts";

test("UPI deep link follows NPCI format and rejects bad VPAs", () => {
  const l = upiLink({ vpa: "glowstudio@okhdfcbank", name: "Glow Studio", amount: 725, note: "Deposit Balayage" });
  assert.equal(l, "upi://pay?pa=glowstudio%40okhdfcbank&pn=Glow%20Studio&am=725.00&cu=INR&tn=Deposit%20Balayage");
  assert.throws(() => upiLink({ vpa: "not-a-vpa", name: "x", amount: 1 }));
});

test("Statutory payroll: PF ceiling, ESI threshold, state professional tax", () => {
  const low = statutory({ basic: 12000, gross: 18000, stateCode: "27", month: 11, pf: true, esi: true });
  assert.equal(low.pf_employee, 1440); assert.equal(low.esi_employee, 135); assert.equal(low.esi_employer, 585); assert.equal(low.pt, 200);
  assert.equal(low.eps + low.epf_employer, 1440);
  const high = statutory({ basic: 30000, gross: 45000, stateCode: "29", month: 2, pf: true, esi: true });
  assert.equal(high.pf_employee, 1800, "PF capped at ₹15,000 wage"); assert.equal(high.esi_employee, 0, "above ESI ceiling"); assert.equal(high.pt, 300, "Karnataka Feb");
  assert.equal(professionalTax("27", 20000, 5, "female"), 0, "MH women exemption up to ₹25,000");
  assert.equal(professionalTax("07", 90000, 5), 0, "Delhi has no PT");
  assert.equal(statutory({ basic: 12000, gross: 18000, stateCode: "07", month: 1, pf: false, esi: false }).employee_deductions, 0);
});

test("CSV import maps Fresha/Booksy-style exports, normalises Indian phones & DD/MM dates, dedupes", () => {
  const csv = 'First Name,Last Name,Mobile Number,Email,Date of Birth,Notes\r\nAsha,Rao,98765 43210,asha@x.in,15/08/1994,"likes ""soft"" curls, no ammonia"\nDup,Person,09876543210,,,\n,,,,,\nRavi,,+91 91234 56789,,1990-1-5,\n';
  const r = mapClientRows(parseCsv(csv));
  assert.equal(r.clients.length, 2); assert.equal(r.skipped, 1);
  assert.deepEqual(r.clients[0], { name: "Asha Rao", phone: "+919876543210", email: "asha@x.in", birthday: "1994-08-15", notes: 'likes "soft" curls, no ammonia' });
  assert.equal(r.clients[1].birthday, "1990-01-05");
});

test("ICS feed is RFC 5545 shaped", () => {
  const ics = buildIcs("Asha · Glow", [{ uid: "b1", start: "2026-11-16T05:30:00Z", end: "2026-11-16T07:30:00Z", summary: "Balayage — Priya; VIP", location: "Colour bay" }]);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /DTSTART:20261116T053000Z/); assert.match(ics, /SUMMARY:Balayage — Priya\; VIP/); assert.match(ics, /END:VCALENDAR\r\n$/);
});
