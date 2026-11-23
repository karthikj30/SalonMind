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

import { detectLang, ruleIntent as langIntent, reply as tr, matchService } from "../src/lib/i18n/concierge.ts";

test("Multilingual rules engine: script detection, intent, day and time in 6 languages", () => {
  const cases: [string, string, string, number | null, string | null][] = [
    ["kal 6 baje haircut book kar do", "en", "book", 1, "18:00"],
    ["कल शाम 6 बजे हेयरकट बुक करना है", "hi", "book", 1, "18:00"],
    ["उद्या 6 वाजता हेअरकट बुक करायचे आहे", "mr", "book", 1, "18:00"],
    ["நாளை 11 மணிக்கு ஃபேஷியல் புக் செய்ய வேண்டும்", "ta", "book", 1, "11:00"],
    ["రేపు 5 గంటలకు హెయిర్ కట్ బుక్ చేయండి", "te", "book", 1, "17:00"],
    ["আগামীকাল ৬টায় চুল কাটা বুক করতে চাই", "bn", "book", 1, "18:00"],
  ];
  for (const [msg, lang, intent, day, time] of cases) {
    const r = langIntent(msg);
    assert.deepEqual([r.language, r.intent, r.dayOffset, r.time], [lang, intent, day, time], msg);
  }
  assert.equal(langIntent("हेयरकट कितने का है?").intent, "price");
  assert.equal(langIntent("ஃபேஷியல் விலை எவ்வளவு?").intent, "price");
  assert.equal(detectLang("hello", "ta"), "ta", "falls back to the client's saved language");
});

test("Multilingual replies render in native script with values filled in", () => {
  const v = { service: "Facial", when: "16 Nov, 11:00 am", stylist: "Asha", price: "₹900" };
  assert.match(tr("ta", "proposal", v), /Facial — 16 Nov, 11:00 am, Asha உடன், ₹900 \+ GST/);
  assert.match(tr("hi", "confirmed", v), /बुकिंग पक्की/);
  assert.match(tr("bn", "handoff"), /ম্যানেজার/);
  assert.match(tr("xx", "declined"), /No problem/, "unknown language falls back to English");
  const services = [{ name: "Men's haircut & beard", category: "grooming" }, { name: "Classic facial", category: "skin" }];
  assert.equal(matchService("চুল কাটা চাই", services)?.name, "Men's haircut & beard");
  assert.equal(matchService("ஃபேஷியல் வேண்டும்", services)?.name, "Classic facial");
});

import { encryptField, decryptField, isEncrypted } from "../src/lib/security/crypto.ts";

test("AES-256-GCM field encryption: round-trip, random IV, tamper detection", () => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const a = encryptField("Allergic to ammonia; pregnant")!, b = encryptField("Allergic to ammonia; pregnant")!;
  assert.ok(isEncrypted(a) && a !== b, "random IV → different ciphertexts");
  assert.ok(!a.includes("ammonia"));
  assert.equal(decryptField(a), "Allergic to ammonia; pregnant");
  assert.equal(decryptField("plain legacy text"), "plain legacy text");
  const tampered = a.slice(0, -4) + (a.at(-4) === "A" ? "B" : "A") + a.slice(-3);
  assert.throws(() => decryptField(tampered), "GCM auth tag rejects tampering");
  delete process.env.DATA_ENCRYPTION_KEY;
});

import { parseWorkflow, sanitizePlan } from "../src/lib/domain/workflow.ts";

const AG = ["inventory", "negotiator", "waste", "concierge", "churn", "retention", "loyalty", "reputation", "noshow", "deals", "waitlist", "recruiter", "performance", "billing", "gst", "optimizer"];

test("Workflow designer: plain-language prompt → agent toggles + parameters", () => {
  const p = parseWorkflow("Turn off the waitlist agent and pause flash deals, ask for a 40% deposit and cap surge at 30%", AG);
  assert.deepEqual(p.disable.sort(), ["deals", "waitlist"]);
  assert.deepEqual(p.settings, { deposit_pct: 40, surge_cap_pct: 30 });
  const q = parseWorkflow("Turn the waitlist back on; give 2 points per ₹100 and a referral bonus of 500", AG);
  assert.deepEqual(q.enable, ["waitlist"]);
  assert.deepEqual(q.settings, { loyalty_points_per_100: 2, referral_bonus_points: 500 });
  assert.equal(parseWorkflow("stop birthday offers", AG).disable[0], "retention");
});

test("Workflow designer: protected agents and out-of-range values are refused", () => {
  const s = sanitizePlan({ disable: ["billing", "waitlist", "hacker"], settings: { deposit_pct: 250, gst_rate: 0, nudge_threshold: 0.2 } }, AG);
  assert.deepEqual(s.disable, ["waitlist"]);
  assert.deepEqual(s.settings, { deposit_pct: 100, nudge_threshold: 0.2 });
  assert.ok(s.notes.some((n) => /billing stays on/.test(n)) && s.notes.some((n) => /gst_rate/.test(n)));
});

import { toEnglishQuery } from "../src/lib/i18n/concierge.ts";

test("Marketplace queries in Indian languages parse without an LLM", () => {
  for (const q of ["कल शाम 1500 से कम में फेशियल", "उद्या संध्याकाळी 1500 पर्यंत फेशियल", "நாளை மாலை 1500-க்குள் ஃபேஷியல்", "రేపు సాయంత్రం 1500 లోపు ఫేషియల్", "আগামীকাল সন্ধ্যায় ১৫০০-এর মধ্যে ফেসিয়াল", "kal shaam facial 1500 ke andar"]) {
    const i = parseIntent(toEnglishQuery(q), []);
    assert.equal(i.maxPrice, 1500, q); assert.equal(i.fromTime, "17:00", q); assert.ok(i.date, q); assert.match(i.service, /facial/, q);
  }
});

import { asciiDigits, isNo as langNo, isYes as langYes } from "../src/lib/i18n/concierge.ts";
import { dict, isRtl, UI_LANGS } from "../src/lib/i18n/ui.ts";

test("13 languages: booking request in every new script is understood (day, time, intent, language)", () => {
  const cases: [string, string][] = [
    ["કાલે સાંજે 6 વાગ્યે હેરકટ બુક કરો", "gu"], ["ನಾಳೆ ಸಂಜೆ 6 ಗಂಟೆಗೆ ಹೇರ್‌ಕಟ್ ಬುಕ್ ಮಾಡಿ", "kn"],
    ["നാളെ വൈകുന്നേരം 6 മണിക്ക് ഹെയർകട്ട് ബുക്ക് ചെയ്യണം", "ml"], ["ਕੱਲ੍ਹ ਸ਼ਾਮ 6 ਵਜੇ ਹੇਅਰਕੱਟ ਬੁੱਕ ਕਰੋ", "pa"],
    ["କାଲି ସନ୍ଧ୍ୟା 6 ଟାରେ ହେୟାରକଟ୍ ବୁକ୍ କରନ୍ତୁ", "or"], ["کل شام 6 بجے ہیئر کٹ بک کر دیں", "ur"],
    ["কাইলৈ সন্ধিয়া ৬ বজাত হেয়াৰকাট বুক কৰক", "as"],
  ];
  for (const [msg, lang] of cases) {
    const r = langIntent(msg);
    assert.deepEqual([r.language, r.intent, r.dayOffset, r.time], [lang, "book", 1, "18:00"], msg);
    assert.match(tr(lang, "proposal", { service: "Haircut" }), /Haircut/, lang);
  }
  for (const y of ["હા", "ಹೌದು", "അതെ", "ਹਾਂ ਜੀ", "ହଁ", "ہاں", "হয়"]) assert.ok(langYes(y), y);
  for (const n of ["ના", "ಬೇಡ", "വേണ്ട", "ਨਹੀਂ", "ନା", "نہیں", "নহয়"]) assert.ok(langNo(n), n);
  assert.equal(asciiDigits("൬ ੬ ૬ ୬ ೬ ۶"), "6 6 6 6 6 6");
});

test("Colour is not mistaken for 'tomorrow' (कलर ⊃ कल, کلر ⊃ کل, কালার ⊃ কাল)", () => {
  for (const q of ["आज शाम कलर", "آج شام کلر", "আজ সন্ধ্যায় কালার"]) {
    const r = langIntent(q); assert.equal(r.dayOffset, 0, q);
    assert.equal(toEnglishQuery(q), "today evening colour", q);
  }
});

test("Every consumer UI language is complete and its example searches parse without an LLM", () => {
  assert.equal(UI_LANGS.length, 13);
  const keys = Object.keys(dict("en")).sort();
  for (const [l] of UI_LANGS) {
    const d = dict(l);
    assert.deepEqual(Object.keys(d).sort(), keys, l);
    assert.equal(d.chips.length, 7, l);
    for (const q of d.examples) {
      const i = parseIntent(toEnglishQuery(q), []);
      assert.ok(i.date && /facial|haircut|colour|balayage|beard/.test(i.service), `${l}: ${q} → ${toEnglishQuery(q)}`);
    }
  }
  assert.ok(isRtl("ur") && !isRtl("hi"));
});

import { chunkText, looksTranslated, maskPii, sourceHash } from "../src/lib/domain/translate.ts";

test("Translation gateway guards: PII is masked and restored, wrong-script and quota outputs are rejected", () => {
  const m = maskPii("Call Priya on +91 98765 43210 or priya@example.com, pay at upi://pay?pa=salon@okhdfcbank ₹1,500");
  assert.doesNotMatch(m.masked, /98765|priya@|okhdfcbank/);
  assert.match(m.masked, /₹1,500/, "prices stay readable for the translator");
  assert.equal(m.restore("प्रिया को ⟦0⟧ पर कॉल करें या ⟦1⟧, [2] पर भुगतान करें"), "प्रिया को +91 98765 43210 पर कॉल करें या priya@example.com, upi://pay?pa=salon@okhdfcbank पर भुगतान करें");
  assert.ok(looksTranslated("फेशियल", "hi", "Facial"));
  assert.ok(!looksTranslated("Facial", "hi", "Facial"), "untranslated echo is rejected");
  assert.ok(!looksTranslated("MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY", "en", "नमस्ते"));
  assert.ok(!looksTranslated("ஃபேஷியல்", "en", "ஃபேஷியல்"), "English output must not stay in an Indian script");
  assert.ok(looksTranslated("₹900", "ta", "₹900"), "nothing to translate in a bare amount");
  const long = Array.from({ length: 40 }, (_, i) => `यह वाक्य संख्या ${i} है।`).join(" ");
  const chunks = chunkText(long);
  assert.ok(chunks.length > 1 && chunks.every((c) => Buffer.byteLength(c) <= 450));
  assert.equal(chunks.join(" "), long);
  assert.equal(sourceHash(" Balayage "), sourceHash("Balayage"));
});

import { coerceValue, parseDate, parseEmail, parseTime, parseVoice, sanitizeActions, type VoiceContext } from "../src/lib/domain/voice.ts";

const clientsPage: VoiceContext = {
  path: "/app/clients",
  forms: [{ index: 0, title: "Add client" }, { index: 1, title: "Delete everything", danger: true }],
  fields: [
    { form: 0, name: "name", label: "Name", type: "text" },
    { form: 0, name: "phone", label: "Phone (WhatsApp)", type: "tel" },
    { form: 0, name: "email", label: "Email", type: "email" },
    { form: 0, name: "language", label: "Preferred language", type: "select-one", options: [{ value: "en", label: "English" }, { value: "ta", label: "Tamil" }, { value: "hi", label: "Hindi" }] },
    { form: 0, name: "birthday", label: "Birthday", type: "date" },
    { form: 0, name: "notes", label: "Notes", type: "textarea" },
    { form: 1, name: "confirm", label: "Type DELETE", type: "text" },
    { form: 0, name: "password", label: "Password", type: "password" },
  ],
  buttons: ["Add client", "Import CSV", "Delete account", "Run all agents now"],
};

test("Voice agent: navigation in English, Hinglish and Indian scripts", () => {
  const dash: VoiceContext = { path: "/app", forms: [], fields: [], buttons: [] };
  for (const [say, path] of [["open bookings", "/app/bookings"], ["take me to the inbox", "/app/inbox"], ["billing", "/app/billing"], ["inventory kholo", "/app/inventory"],
    ["बुकिंग खोलो", "/app/bookings"], ["Open in box.", "/app/inbox"], ["ग्राहक दिखाओ", "/app/clients"], ["முன்பதிவு திற", "/app/bookings"], ["ان باکس کھولو", "/app/inbox"], ["show me staff payroll", "/app/staff"]] as const)
    assert.deepEqual(parseVoice(say, dash), [{ type: "navigate", path }], say);
  // "add client …" from another page goes to Clients first; the browser repeats the sentence there
  assert.deepEqual(parseVoice("add client name Meera phone 9876543210", dash), [{ type: "navigate", path: "/app/clients" }]);
});

test("Voice agent: one sentence fills several fields with typed values", () => {
  const a = parseVoice("add client name meera nair phone 98765 43210 email meera at gmail dot com language tamil birthday 5 march 1994 notes allergic to ammonia on the scalp", clientsPage);
  assert.deepEqual(a, [
    { type: "fill", form: 0, name: "name", value: "Meera Nair" },
    { type: "fill", form: 0, name: "phone", value: "9876543210" },
    { type: "fill", form: 0, name: "email", value: "meera@gmail.com" },
    { type: "fill", form: 0, name: "language", value: "ta" },
    { type: "fill", form: 0, name: "birthday", value: "1994-03-05" },
    { type: "fill", form: 0, name: "notes", value: "Allergic to ammonia on the scalp" },
  ]);
  assert.deepEqual(parseVoice("नाम मीरा रखो और फ़ोन 9876543210", clientsPage), [
    { type: "fill", form: 0, name: "name", value: "मीरा" }, { type: "fill", form: 0, name: "phone", value: "9876543210" }]);
  assert.deepEqual(parseVoice("phone is plus 91 double 9 8765 4321 0 and save", clientsPage).map((x) => x.type), ["fill", "submit"]);
  assert.deepEqual(parseVoice("save", clientsPage), [{ type: "submit", form: -1 }]);
});

test("Voice agent: questions, theme, clicks — and nothing destructive or secret", () => {
  assert.deepEqual(parseVoice("how many bookings today?", clientsPage), [{ type: "query", topic: "bookings_today" }]);
  assert.deepEqual(parseVoice("what is today's revenue", clientsPage), [{ type: "query", topic: "revenue_today" }]);
  assert.deepEqual(parseVoice("dark mode", clientsPage), [{ type: "theme", mode: "dark" }]);
  assert.deepEqual(parseVoice("click run all agents now", clientsPage), [{ type: "click", label: "Run all agents now" }]);
  assert.equal(parseVoice("click delete account", clientsPage)[0].type, "say", "destructive buttons are never clicked by voice");
  assert.deepEqual(parseVoice("password hunter2", clientsPage).filter((x) => x.type === "fill"), [], "passwords are never filled by voice");
  // LLM output is validated against the real page
  const cleaned = sanitizeActions([
    { type: "navigate", path: "/app/bookings" }, { type: "navigate", path: "https://evil.example" }, { type: "navigate", path: "/app/settings/../../admin" },
    { type: "fill", form: 0, name: "phone", value: "98765-43210" }, { type: "fill", form: 0, name: "password", value: "x" }, { type: "fill", form: 1, name: "confirm", value: "DELETE" },
    { type: "fill", form: 0, name: "language", value: "Klingon" }, { type: "fill", form: 0, name: "nonexistent", value: "x" },
    { type: "submit", form: 1 }, { type: "submit", form: 0 }, { type: "click", label: "Delete account" }, { type: "click", label: "import csv" }, { type: "eval", code: "alert(1)" },
  ], clientsPage);
  assert.deepEqual(cleaned, [
    { type: "navigate", path: "/app/bookings" }, { type: "fill", form: 0, name: "phone", value: "9876543210" },
    { type: "submit", form: 0 }, { type: "click", label: "Import CSV" },
  ]);
});

test("Voice agent: dates, times and e-mails as people say them", () => {
  assert.equal(parseTime("6 pm"), "18:00"); assert.equal(parseTime("6:30 in the evening"), "18:30"); assert.equal(parseTime("at 6"), "18:00");
  assert.equal(parseTime("11 am"), "11:00"); assert.equal(parseTime("14:15"), "14:15");
  assert.equal(parseDate("25/12/2026"), "2026-12-25"); assert.equal(parseDate("march 5th 2027"), "2027-03-05"); assert.ok(parseDate("tomorrow"));
  assert.equal(parseEmail("priya dot sharma at the rate gmail dot com"), "priya.sharma@gmail.com"); assert.equal(parseEmail("not an email"), null);
  assert.equal(coerceValue({ form: 0, name: "base_price", label: "Price", type: "number" }, "2 thousand rupees"), "2000");
});

import { estimateWaits, waitLabel } from "../src/lib/domain/queue.ts";
import { summariseDay } from "../src/lib/domain/dayclose.ts";

test("Walk-in queue: wait estimates respect stylists' existing appointments and working hours", () => {
  const staff = [
    { id: "a", workStart: 600, workEnd: 1200, busy: [{ start: 600, end: 660 }] },          // busy until 11:00
    { id: "b", workStart: 600, workEnd: 1200, busy: [{ start: 630, end: 690 }] },          // free now, appointment 10:30–11:30
  ];
  const eta = estimateWaits([{ id: "t1", duration: 30 }, { id: "t2", duration: 45 }, { id: "t3", duration: 30 }], staff, 600); // it is 10:00
  assert.deepEqual(eta.map((e) => [e.position, e.waitMin]), [[1, 0], [2, 60], [3, 90]]);
  // t1 fits b's gap before 10:30; t2 (45 min) needs a from 11:00; t3 goes to b at 11:30
  assert.equal(estimateWaits([{ id: "late", duration: 60 }], [{ id: "a", workStart: 600, workEnd: 630, busy: [] }], 600)[0].waitMin, null, "cannot finish before closing");
  assert.equal(waitLabel(0), "now"); assert.equal(waitLabel(23), "about 25 min"); assert.equal(waitLabel(70), "about 1 h 10 min"); assert.match(waitLabel(null), /not today/);
});

test("Day-end closing: totals by payment mode, GST, cash to count, booth-renter payouts and top services", () => {
  const d = summariseDay([
    { total: 1180, taxable_value: 1000, cgst: 90, sgst: 90, igst: 0, payment_method: "cash", items: [{ description: "Haircut", kind: "service", taxable_value: 1000 }], splits: { gateway_fee: 0, tax_bucket: 180, salon_owner: 1000, booth_renter: null } },
    { total: 3540, taxable_value: 3000, cgst: 270, sgst: 270, igst: 0, payment_method: "card", items: [{ description: "Balayage", kind: "service", taxable_value: 2500 }, { description: "Shampoo", kind: "product", taxable_value: 500 }], splits: { gateway_fee: 70.8, tax_bucket: 540, salon_owner: 878.76, booth_renter: { name: "Ravi", amount: 2050.44 } } },
    { total: 590, taxable_value: 500, cgst: 45, sgst: 45, igst: 0, payment_method: "cash", items: [{ description: "Haircut", kind: "service", taxable_value: 500 }], splits: null },
  ], [100, 50]);
  assert.equal(d.invoices, 3); assert.equal(d.total, 5310); assert.equal(d.gst, 810); assert.equal(d.cashToCount, 1770);
  assert.deepEqual(d.methods, [{ method: "card", count: 1, total: 3540 }, { method: "cash", count: 2, total: 1770 }]);
  assert.equal(d.services, 4000); assert.equal(d.products, 500); assert.equal(d.tips, 150); assert.equal(d.avgTicket, 1770);
  assert.deepEqual(d.renters, [{ name: "Ravi", amount: 2050.44 }]); assert.equal(d.top[0].name, "Balayage"); assert.equal(d.top[1].value, 1500);
});

import { UI_SOURCE } from "../src/lib/i18n/app/source.ts";
import { extract as extractUiStrings } from "../scripts/extract-ui-strings.mjs";

test("Owner dashboard dictionaries: 12 languages, same keys, every key is real UI text, values in the right script", async () => {
  const SCRIPT: Record<string, RegExp> = { hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, bn: /[ঀ-৿]/, as: /[ঀ-৿]/, ta: /[஀-௿]/, te: /[ఀ-౿]/,
    gu: /[઀-૿]/, ur: /[؀-ۿ]/, kn: /[ಀ-೿]/, or: /[଀-୿]/, ml: /[ഀ-ൿ]/, pa: /[਀-੿]/ };
  const allow = new Set(UI_SOURCE);
  const base = Object.keys((await import("../src/lib/i18n/app/hi.ts")).default).sort();
  assert.ok(base.length >= 400, "core dictionary covers the most visible strings");
  for (const [lang, re] of Object.entries(SCRIPT)) {
    const d: Record<string, string> = (await import(`../src/lib/i18n/app/${lang}.ts`)).default;
    assert.deepEqual(Object.keys(d).sort(), base, `${lang}: same keys as Hindi`);
    for (const [k, v] of Object.entries(d)) {
      assert.ok(allow.has(k), `${lang}: "${k}" is not a UI string`);
      assert.ok(v.trim(), `${lang}: empty translation for "${k}"`);
    }
    const native = Object.values(d).filter((v) => re.test(v)).length / base.length;
    assert.ok(native > 0.95, `${lang}: only ${Math.round(native * 100)}% of values are in the ${lang} script`);
  }
});

test("UI string allowlist is up to date with the source (run npm run i18n:extract after changing copy)", () => {
  assert.deepEqual([...UI_SOURCE], extractUiStrings());
});

import { giftCode, normalizeGiftCode, giftCardUsable, prepaidSplit, pickPackage, packageSaving, expiryReminderStage, manageWindow } from "../src/lib/domain/prepaid.ts";

test("Gift cards: codes are readable, normalised from what a cashier types, and validated", () => {
  const code = giftCode();
  assert.match(code, /^GC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(normalizeGiftCode(code.toLowerCase().replace(/-/g, " ")), code);
  assert.equal(normalizeGiftCode("gc7kqmx2pa"), "GC-7KQM-X2PA");
  assert.equal(normalizeGiftCode("GC-123"), null);
  assert.deepEqual(giftCardUsable({ balance: 500, expires_at: "2026-12-31", status: "active" }, "2026-11-23"), { ok: true });
  assert.equal(giftCardUsable({ balance: 500, expires_at: "2026-11-22", status: "active" }, "2026-11-23").ok, false);
  assert.equal(giftCardUsable({ balance: 0, expires_at: "2026-12-31", status: "redeemed" }, "2026-11-23").ok, false);
});

test("Prepaid split: gift card first, then wallet, then the payment rail — never more than due", () => {
  assert.deepEqual(prepaidSplit(1180, { giftBalance: 1000, walletBalance: 500, useWallet: true }), { fromGift: 1000, fromWallet: 180, remaining: 0 });
  assert.deepEqual(prepaidSplit(1180, { giftBalance: 2000 }), { fromGift: 1180, fromWallet: 0, remaining: 0 });
  assert.deepEqual(prepaidSplit(1180, { giftBalance: 300, walletBalance: 500, useWallet: false }), { fromGift: 300, fromWallet: 0, remaining: 880 });
  assert.deepEqual(prepaidSplit(-5, { giftBalance: 300 }), { fromGift: 0, fromWallet: 0, remaining: 0 });
});

test("Packages: consume the session that expires first; skip used-up or expired ones", () => {
  const pk = [
    { id: "late", service_id: "s1", sessions_left: 3, expires_at: "2027-03-01" },
    { id: "soon", service_id: "s1", sessions_left: 1, expires_at: "2026-12-01" },
    { id: "empty", service_id: "s1", sessions_left: 0, expires_at: "2026-11-30" },
    { id: "old", service_id: "s1", sessions_left: 2, expires_at: "2026-11-01" },
    { id: "other", service_id: "s2", sessions_left: 5, expires_at: "2026-11-25" },
  ];
  assert.equal(pickPackage(pk, "s1", "2026-11-23")?.id, "soon");
  assert.equal(pickPackage(pk, "s3", "2026-11-23"), null);
  assert.deepEqual(packageSaving({ sessions: 5, price: 2000, servicePrice: 500 }), { full: 2500, saving: 500, perSession: 400 });
});

test("Prepaid reminders and the customer self-service window", () => {
  assert.equal(expiryReminderStage("2026-12-20", "2026-11-23"), null);
  assert.equal(expiryReminderStage("2026-12-05", "2026-11-23"), "first");
  assert.equal(expiryReminderStage("2026-11-25", "2026-11-23"), "last");
  assert.equal(expiryReminderStage("2026-11-20", "2026-11-23"), null);
  const now = new Date("2026-11-23T10:00:00Z");
  assert.deepEqual(manageWindow({ status: "booked", start_at: "2026-11-23T15:00:00Z" }, now), { canChange: true });
  assert.deepEqual(manageWindow({ status: "booked", start_at: "2026-11-23T11:00:00Z" }, now), { canChange: false, reason: "too_late" });
  assert.deepEqual(manageWindow({ status: "cancelled", start_at: "2026-11-24T11:00:00Z" }, now), { canChange: false, reason: "closed" });
  assert.deepEqual(manageWindow({ status: "booked", start_at: "2026-11-23T09:00:00Z" }, now), { canChange: false, reason: "past" });
});
