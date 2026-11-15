/**
 * GST engine for Indian salons.
 * - Salon services: SAC 999721/999722, 18% GST. Place of supply for services needing physical presence
 *   is where the service is performed (IGST Act s.12(3)/13(3)) → normally intra-state → CGST + SGST.
 * - Retail products: HSN-based rate (default 18%).
 * - Procurement from another state → IGST input tax credit.
 */
export type TaxLine = { description: string; kind: "service" | "product"; code: string; qty: number; rate: number; unit_price: number; staff_id?: string | null; product_id?: string | null };

export function splitTax(taxable: number, ratePct: number, interstate: boolean) {
  const tax = round2((taxable * ratePct) / 100);
  if (interstate) return { cgst: 0, sgst: 0, igst: tax };
  const half = round2(tax / 2);
  return { cgst: half, sgst: round2(tax - half), igst: 0 };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeInvoice(lines: TaxLine[], supplierState: string | null, placeOfSupply: string | null) {
  const interstate = !!supplierState && !!placeOfSupply && supplierState !== placeOfSupply;
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const items = lines.map((l) => {
    const value = round2(l.unit_price * l.qty);
    const t = splitTax(value, l.rate, interstate);
    taxable += value; cgst += t.cgst; sgst += t.sgst; igst += t.igst;
    return { ...l, taxable_value: value, ...t, total: round2(value + t.cgst + t.sgst + t.igst) };
  });
  return {
    items, interstate,
    taxable_value: round2(taxable), cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst),
    total: round2(taxable + cgst + sgst + igst),
  };
}

/** Indian financial year label, e.g. 2026-27 for any date between Apr-2026 and Mar-2027. */
export function financialYear(d: Date): string {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function invoiceNumber(prefix: string, d: Date, seq: number): string {
  return `${prefix}/${financialYear(d)}/${String(seq).padStart(4, "0")}`;
}

/** Deterministic e-invoice reference (real IRN requires an IRP/GSP integration; hash format mirrors it). */
export async function pseudoIrn(gstin: string, number: string, date: string): Promise<string> {
  const data = new TextEncoder().encode(`${gstin}|${financialYear(new Date(date))}|INV|${number}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Automated split payout of a paid invoice: tax bucket, booth renter, salon owner, gateway fee. */
export function splitPayout(inv: { taxable_value: number; cgst: number; sgst: number; igst: number; total: number },
  method: string, renter?: { name: string; booth_rent_pct: number } | null) {
  const feePct: Record<string, number> = { upi: 0, card: 2, netbanking: 1.9, cash: 0, wallet: 1.5 };
  const gateway_fee = round2((inv.total * (feePct[method] ?? 0)) / 100);
  const tax_bucket = round2(inv.cgst + inv.sgst + inv.igst);
  const net = round2(inv.taxable_value - gateway_fee);
  const renter_share = renter ? round2(net * (1 - renter.booth_rent_pct / 100)) : 0;
  return {
    method, gateway_fee, tax_bucket,
    booth_renter: renter ? { name: renter.name, amount: renter_share } : null,
    salon_owner: round2(net - renter_share),
  };
}

type Inv = { number: string; invoice_date: string; place_of_supply: string | null; items: (TaxLine & { taxable_value: number; cgst: number; sgst: number; igst: number })[]; taxable_value: number; cgst: number; sgst: number; igst: number; total: number };
type Po = { subtotal: number; gst_amount: number; is_interstate: boolean };

export function buildReturns(invoices: Inv[], receivedPOs: Po[]) {
  // GSTR-1: B2C small summary by place of supply + rate; HSN/SAC summary; document summary
  const b2cs = new Map<string, { pos: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  const hsn = new Map<string, { code: string; kind: string; qty: number; taxable: number; tax: number }>();
  for (const inv of invoices) {
    for (const it of inv.items) {
      const k = `${inv.place_of_supply}|${it.rate}`;
      const row = b2cs.get(k) ?? { pos: inv.place_of_supply ?? "", rate: it.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      row.taxable += it.taxable_value; row.cgst += it.cgst; row.sgst += it.sgst; row.igst += it.igst;
      b2cs.set(k, row);
      const h = hsn.get(it.code) ?? { code: it.code, kind: it.kind, qty: 0, taxable: 0, tax: 0 };
      h.qty += it.qty; h.taxable += it.taxable_value; h.tax += it.cgst + it.sgst + it.igst;
      hsn.set(it.code, h);
    }
  }
  const nums = invoices.map((i) => i.number).sort();
  const out = invoices.reduce((a, i) => ({ taxable: a.taxable + i.taxable_value, cgst: a.cgst + i.cgst, sgst: a.sgst + i.sgst, igst: a.igst + i.igst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  const itc = receivedPOs.reduce((a, p) => {
    if (p.is_interstate) a.igst += p.gst_amount; else { a.cgst += p.gst_amount / 2; a.sgst += p.gst_amount / 2; }
    a.taxable += p.subtotal; return a;
  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  // ITC utilisation order (s.49 CGST Act, simplified): IGST credit → IGST, CGST, SGST; CGST → CGST, IGST; SGST → SGST, IGST
  const liab = { igst: out.igst, cgst: out.cgst, sgst: out.sgst };
  const credit = { ...itc };
  const use = (from: "igst" | "cgst" | "sgst", to: "igst" | "cgst" | "sgst") => {
    const x = Math.min(credit[from], liab[to]); credit[from] -= x; liab[to] -= x;
  };
  use("igst", "igst"); use("igst", "cgst"); use("igst", "sgst");
  use("cgst", "cgst"); use("cgst", "igst");
  use("sgst", "sgst"); use("sgst", "igst");
  const r = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round2(v)]));
  return {
    gstr1: {
      b2cs: [...b2cs.values()].map((x) => ({ pos: x.pos, rate: x.rate, taxable: round2(x.taxable), cgst: round2(x.cgst), sgst: round2(x.sgst), igst: round2(x.igst) })),
      hsn: [...hsn.values()].map((h) => ({ ...h, taxable: round2(h.taxable), tax: round2(h.tax) })),
      docs: { from: nums[0] ?? null, to: nums[nums.length - 1] ?? null, count: nums.length },
    },
    gstr3b: {
      outward_taxable: r(out),
      itc_available: r(itc),
      tax_payable_cash: r(liab),
      credit_carried_forward: r(credit),
    },
    itc: r(itc),
  };
}
