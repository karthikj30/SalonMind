import type { Staff } from "./types.ts";

/** Progressive slab commission: each slab's % applies only to revenue within that slab (Indian salon norm). */
export function slabCommission(revenue: number, slabs: { upto: number | null; pct: number }[], mode: "progressive" | "flat" = "progressive") {
  const sorted = [...slabs].sort((a, b) => (a.upto ?? Infinity) - (b.upto ?? Infinity));
  if (mode === "flat") {
    const slab = sorted.find((s) => s.upto === null || revenue <= s.upto) ?? sorted[sorted.length - 1];
    return { amount: Math.round((revenue * slab.pct) / 100), breakdown: [{ range: `flat ${slab.pct}%`, amount: Math.round((revenue * slab.pct) / 100) }] };
  }
  let prev = 0, total = 0;
  const breakdown: { range: string; amount: number }[] = [];
  for (const s of sorted) {
    const cap = s.upto ?? Infinity;
    if (revenue <= prev) break;
    const portion = Math.min(revenue, cap) - prev;
    const amt = (portion * s.pct) / 100;
    total += amt;
    breakdown.push({ range: `₹${prev.toLocaleString("en-IN")}–${cap === Infinity ? "∞" : "₹" + cap.toLocaleString("en-IN")} @ ${s.pct}%`, amount: Math.round(amt) });
    prev = cap;
  }
  return { amount: Math.round(total), breakdown };
}

export function payrollLine(st: Staff, serviceRevenue: number, productRevenue: number, tips: number, penalties: number, bonus: number) {
  if (st.employment_type === "booth_renter") {
    const payout = Math.round(serviceRevenue * (1 - st.booth_rent_pct / 100));
    return {
      staff_id: st.id, name: st.name, type: "booth_renter", service_revenue: serviceRevenue, product_revenue: productRevenue,
      base: 0, service_commission: 0, product_commission: 0, tips, penalties, bonus,
      booth_payout: payout, breakdown: [{ range: `revenue share ${100 - st.booth_rent_pct}%`, amount: payout }],
      net: payout + tips + bonus - penalties,
    };
  }
  const sc = slabCommission(serviceRevenue, st.commission_slabs);
  const pc = Math.round((productRevenue * st.product_commission_pct) / 100);
  return {
    staff_id: st.id, name: st.name, type: "employee", service_revenue: serviceRevenue, product_revenue: productRevenue,
    base: st.base_salary, service_commission: sc.amount, product_commission: pc, tips, penalties, bonus,
    booth_payout: 0, breakdown: sc.breakdown,
    net: Math.round(st.base_salary + sc.amount + pc + tips + bonus - penalties),
  };
}
