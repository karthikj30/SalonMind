import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { fmtDate, inr } from "@/lib/time";
import { stateName } from "@/lib/states";

type Item = { description: string; code: string; qty: number; rate: number; unit_price: number; taxable_value: number; cgst: number; sgst: number; igst: number; total: number };

export default async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, tenant } = await getTenantContext();
  const { data: inv } = await db.from("invoices").select("*, clients(name, phone)").eq("id", id).single();
  if (!inv) notFound();
  const sp = inv.splits ?? {};
  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-white p-8 shadow-sm">
      <div className="flex justify-between">
        <div><h1 className="text-xl font-bold">{tenant.name}</h1><p className="text-xs text-slate-500">{tenant.address}<br />{tenant.city}, {tenant.state} · GSTIN {tenant.gstin ?? "—"}</p></div>
        <div className="text-right text-sm"><p className="font-semibold">TAX INVOICE</p><p className="font-mono">{inv.number}</p><p>{fmtDate(inv.invoice_date)}</p></div>
      </div>
      <p className="mt-4 text-sm">Billed to: <b>{inv.clients?.name ?? "Walk-in"}</b> {inv.clients?.phone} · Place of supply: {inv.place_of_supply} {stateName(inv.place_of_supply)}</p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-slate-500"><th>Item</th><th>SAC/HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th className="text-right">Total</th></tr></thead>
        <tbody>{(inv.items as Item[]).map((i, k) => <tr key={k} className="border-b"><td className="py-1">{i.description}</td><td>{i.code}</td><td>{i.qty}</td><td>{inr(i.unit_price)}</td><td>{inr(i.taxable_value)}</td><td>{i.rate}%</td><td className="text-right">{inr(i.total)}</td></tr>)}</tbody>
      </table>
      <div className="ml-auto mt-3 w-64 space-y-0.5 text-sm">
        <div className="flex justify-between"><span>Taxable value</span><span>{inr(inv.taxable_value)}</span></div>
        {Number(inv.cgst) > 0 && <div className="flex justify-between"><span>CGST</span><span>{inr(inv.cgst)}</span></div>}
        {Number(inv.sgst) > 0 && <div className="flex justify-between"><span>SGST</span><span>{inr(inv.sgst)}</span></div>}
        {Number(inv.igst) > 0 && <div className="flex justify-between"><span>IGST</span><span>{inr(inv.igst)}</span></div>}
        <div className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span>{inr(inv.total)}</span></div>
        {sp.deposit_adjusted > 0 && <div className="flex justify-between text-xs"><span>Deposit adjusted</span><span>−{inr(sp.deposit_adjusted)}</span></div>}
      </div>
      {inv.irn && <p className="mt-4 break-all font-mono text-[10px] text-slate-500">IRN (reference): {inv.irn}</p>}
      <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs">
        <p className="mb-1 font-semibold">Split payout ({String(inv.payment_method).toUpperCase()})</p>
        <p>Tax bucket: {inr(sp.tax_bucket)} · Gateway fee: {inr(sp.gateway_fee)} · Salon owner: {inr(sp.salon_owner)}{sp.booth_renter && ` · Booth renter ${sp.booth_renter.name}: ${inr(sp.booth_renter.amount)}`}</p>
      </div>
      <p className="no-print mt-6 text-center text-xs"><a href="/app/billing" className="text-brand-600">← back</a> · use your browser&apos;s Print to save as PDF</p>
    </div>
  );
}
