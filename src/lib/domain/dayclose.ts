/** Day-end closing ("Z-report"): totals a salon owner tallies against the cash drawer and UPI/card settlements. Pure. */
export type CloseInvoice = {
  total: number; taxable_value: number; cgst: number; sgst: number; igst: number; payment_method: string | null;
  items?: { description?: string; kind?: string; taxable_value?: number }[] | null;
  splits?: { gateway_fee?: number; tax_bucket?: number; salon_owner?: number; booth_renter?: { name: string; amount: number } | null } | null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function summariseDay(invoices: CloseInvoice[], tips: number[] = []) {
  const byMethod = new Map<string, { count: number; total: number }>();
  const top = new Map<string, number>();
  const renters = new Map<string, number>();
  let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0, fees = 0, owner = 0, services = 0, products = 0;
  for (const i of invoices) {
    const m = (i.payment_method || "other").toLowerCase();
    const cur = byMethod.get(m) ?? { count: 0, total: 0 };
    byMethod.set(m, { count: cur.count + 1, total: cur.total + Number(i.total) });
    taxable += Number(i.taxable_value); cgst += Number(i.cgst); sgst += Number(i.sgst); igst += Number(i.igst); total += Number(i.total);
    fees += Number(i.splits?.gateway_fee ?? 0); owner += Number(i.splits?.salon_owner ?? 0);
    if (i.splits?.booth_renter) renters.set(i.splits.booth_renter.name, (renters.get(i.splits.booth_renter.name) ?? 0) + Number(i.splits.booth_renter.amount));
    for (const it of i.items ?? []) {
      const v = Number(it.taxable_value ?? 0);
      if (it.kind === "product") products += v; else services += v;
      if (it.description) top.set(it.description, (top.get(it.description) ?? 0) + v);
    }
  }
  const methods = [...byMethod.entries()].map(([method, v]) => ({ method, count: v.count, total: r2(v.total) })).sort((a, b) => b.total - a.total);
  return {
    invoices: invoices.length, taxable: r2(taxable), cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), gst: r2(cgst + sgst + igst), total: r2(total),
    methods, cashToCount: r2(byMethod.get("cash")?.total ?? 0), // what should physically be in the drawer
    services: r2(services), products: r2(products), gatewayFees: r2(fees), ownerShare: r2(owner),
    renters: [...renters.entries()].map(([name, amount]) => ({ name, amount: r2(amount) })),
    tips: r2(tips.reduce((a, b) => a + Number(b), 0)),
    top: [...top.entries()].map(([name, value]) => ({ name, value: r2(value) })).sort((a, b) => b.value - a.value).slice(0, 5),
    avgTicket: invoices.length ? r2(total / invoices.length) : 0,
  };
}
