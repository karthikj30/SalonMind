import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addExpense, deleteExpense, prepareGst } from "../actions";
import { monthlyPnl } from "@/lib/services/backoffice";
import { Receipt, TrendingUp } from "lucide-react";
import { addDays, fmtDate, inr, istDate, todayIst } from "@/lib/time";
import { summariseDay, type CloseInvoice } from "@/lib/domain/dayclose";
import { stateName } from "@/lib/states";

type R3b = { outward_taxable: Record<string, number>; itc_available: Record<string, number>; itc_reversed?: Record<string, number>; tax_payable_cash: Record<string, number>; credit_carried_forward: Record<string, number> };

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const period = sp.period || todayIst().slice(0, 7);
  const [{ data: invoices }, { data: ret }] = await Promise.all([
    db.from("invoices").select("*, clients(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100),
    db.from("gst_returns").select("*").eq("tenant_id", tenant.id).eq("period", period).maybeSingle(),
  ]);
  // Day-end closing for the chosen date (defaults to today)
  const closeDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.close ?? "") ? sp.close : todayIst();
  const [{ data: dayInv }, { data: dayTips }] = await Promise.all([
    db.from("invoices").select("total, taxable_value, cgst, sgst, igst, payment_method, items, splits").eq("tenant_id", tenant.id).eq("invoice_date", closeDate),
    db.from("staff_adjustments").select("amount").eq("tenant_id", tenant.id).eq("kind", "tip").gte("created_at", istDate(closeDate, "00:00").toISOString()).lt("created_at", istDate(addDays(closeDate, 1), "00:00").toISOString()),
  ]);
  const pnlMonth = /^\d{4}-\d{2}$/.test(sp.pnl ?? "") ? sp.pnl : todayIst().slice(0, 7);
  const [pnl, { data: expenses }] = await Promise.all([
    monthlyPnl(db, tenant, pnlMonth),
    db.from("expenses").select("*").eq("tenant_id", tenant.id).gte("spent_on", `${pnlMonth}-01`).lte("spent_on", `${pnlMonth}-31`).order("spent_on", { ascending: false }),
  ]);
  const dc = summariseDay((dayInv ?? []) as CloseInvoice[], (dayTips ?? []).map((t) => Number(t.amount)));
  const g = ret?.gstr3b as R3b | undefined;
  const g1 = ret?.gstr1 as { b2cs: { pos: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }[]; hsn: { code: string; kind: string; qty: number; taxable: number; tax: number }[]; docs: { from: string; to: string; count: number } } | undefined;
  return (
    <>
      <PageHeader eyebrow="Finance" title="Billing, POS & GST" subtitle="Invoices are issued automatically by the Billing Agent when a service is completed. Split payouts route money to the owner, booth renters and the tax bucket. The GST Agent drafts GSTR-1 & GSTR-3B with ITC from received purchase orders." />
      <Flash msg={sp.msg} error={sp.error} />
      {!tenant.gstin && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Add your GSTIN in Settings to generate e-invoice reference numbers (IRN).</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Invoices" className="lg:col-span-2">
          <Table head={["No.", "Date", "Client", "Taxable", "CGST", "SGST", "IGST", "Total", "Paid via", ""]} empty="No invoices yet — complete a booking.">
            {(invoices ?? []).map((i) => (
              <tr key={i.id}>
                <Td className="font-mono text-xs">{i.number}</Td><Td className="text-xs">{fmtDate(i.invoice_date)}</Td><Td>{i.clients?.name ?? "—"}</Td>
                <Td>{inr(i.taxable_value)}</Td><Td>{inr(i.cgst)}</Td><Td>{inr(i.sgst)}</Td><Td>{inr(i.igst)}</Td><Td className="font-semibold">{inr(i.total)}</Td>
                <Td><Badge tone="green">{String(i.payment_method).toUpperCase()}</Badge></Td>
                <Td><a href={`/app/billing/${i.id}`} className="text-xs text-brand-600 hover:underline">View</a></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={`Day-end closing · ${fmtDate(closeDate)}`} className="lg:col-span-3" actions={
          <form className="flex items-end gap-2 text-xs"><input type="hidden" name="period" value={period} /><Input type="date" name="close" defaultValue={closeDate} aria-label="Closing date" /><button className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-sm hover:bg-brand-50">Show</button></form>}>
          {dc.invoices ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-day-close>
              <div className="rounded-xl bg-ivory-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-900/50">Collected</p>
                <p className="mt-1 font-display text-2xl font-semibold text-brand-900">{inr(dc.total)}</p>
                <p className="text-xs text-brand-900/55">{dc.invoices} invoice{dc.invoices === 1 ? "" : "s"} · average {inr(dc.avgTicket)}</p>
                <p className="mt-2 text-xs text-brand-900/70">Services {inr(dc.services)} · products {inr(dc.products)}{dc.tips ? ` · tips ${inr(dc.tips)}` : ""}</p>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-900/50">By payment mode</p>
                <ul className="mt-1 space-y-0.5 text-sm">{dc.methods.map((m) => <li key={m.method} className="flex justify-between"><span className="capitalize">{m.method === "upi" ? "UPI" : m.method} <span className="text-xs text-brand-900/45">×{m.count}</span></span><b>{inr(m.total)}</b></li>)}</ul>
                <p className="mt-2 rounded-lg bg-gold-100 px-2 py-1 text-xs text-brand-900">Cash to count in the drawer: <b>{inr(dc.cashToCount)}</b></p>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-900/50">Where the money goes</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  <li className="flex justify-between"><span>GST bucket</span><b>{inr(dc.gst)}</b></li>
                  <li className="flex justify-between"><span>Salon owner</span><b>{inr(dc.ownerShare)}</b></li>
                  {dc.renters.map((r) => <li key={r.name} className="flex justify-between"><span>{r.name} <span className="text-xs text-brand-900/45">booth</span></span><b>{inr(r.amount)}</b></li>)}
                  {dc.gatewayFees > 0 && <li className="flex justify-between text-brand-900/60"><span>Gateway fees</span><span>{inr(dc.gatewayFees)}</span></li>}
                </ul>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-900/50">Top sellers</p>
                <ul className="mt-1 space-y-0.5 text-sm">{dc.top.map((t) => <li key={t.name} className="flex justify-between gap-2"><span className="truncate">{t.name}</span><b>{inr(t.value)}</b></li>)}</ul>
              </div>
            </div>
          ) : <p className="text-sm text-brand-900/45">No invoices on {fmtDate(closeDate)}. Pick another date, or complete a booking to issue one.</p>}
        </Card>
        <Card title={`Profit & loss · ${pnlMonth}`} icon={<TrendingUp className="h-4 w-4" />} className="lg:col-span-2" actions={
          <form className="flex items-center gap-1"><Input name="pnl" type="month" defaultValue={pnlMonth} aria-label="Month" className="!py-1 text-xs" /><button className="rounded-lg border border-brand-200 px-2 py-1 text-xs hover:bg-brand-50">Show</button></form>
        }>
          <div className="grid gap-4 sm:grid-cols-2" data-pnl>
            <table className="w-full text-sm">
              <tbody>
                {([["Revenue (excl. GST)", pnl.revenue, ""], ["  of which services", pnl.serviceRevenue, "sub"], ["  of which retail", pnl.productSales, "sub"], ["Product cost (retail + back-bar)", -pnl.productCost, ""], ["Gross profit", pnl.grossProfit, "b"], ["Staff cost (payroll + PF/ESI)", -pnl.payroll, ""], ["Expenses", -pnl.expenses, ""]] as const).map(([l, v, k]) => (
                  <tr key={l} className={k === "b" ? "border-t font-semibold" : ""}><td className={`py-1 ${k === "sub" ? "ps-4 text-xs text-brand-900/55" : ""}`}>{l.trim()}</td><td className={`text-right ${k === "sub" ? "text-xs text-brand-900/55" : ""}`}>{v < 0 ? `−${inr(-v)}` : inr(v)}</td></tr>
                ))}
                <tr className="border-t-2 border-brand-200 text-base font-bold"><td className="py-1.5">Net profit</td><td className={`text-right ${pnl.net < 0 ? "text-red-700" : "text-emerald-700"}`}>{pnl.net < 0 ? `−${inr(-pnl.net)}` : inr(pnl.net)}</td></tr>
              </tbody>
            </table>
            <div className="text-sm">
              <p className="text-xs uppercase tracking-wide text-brand-900/50">Margin</p>
              <p className={`font-display text-3xl font-semibold ${pnl.net < 0 ? "text-red-700" : "text-brand-900"}`}>{pnl.margin}%</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-brand-900/50">Where the money went</p>
              <ul className="mt-1 space-y-1 text-xs">{pnl.expensesByCategory.length ? pnl.expensesByCategory.map((e) => <li key={e.category} className="flex justify-between"><span className="capitalize">{e.category}</span><span>{inr(e.amount)}</span></li>) : <li className="text-brand-900/45">No expenses recorded for this month.</li>}</ul>
              <p className="mt-3 text-[11px] text-brand-900/45">{fmtDate(pnl.from)} → {fmtDate(pnl.to)}. GST collected is owed to the government, so it is not counted as income.</p>
            </div>
          </div>
        </Card>
        <Card title="Expenses" icon={<Receipt className="h-4 w-4" />}>
          <form action={addExpense} className="grid grid-cols-2 gap-2">
            <Field label="Date"><Input name="spent_on" type="date" defaultValue={todayIst()} max={todayIst()} /></Field>
            <Field label="Category"><Select name="category" defaultValue="supplies">{["rent", "utilities", "supplies", "marketing", "maintenance", "salaries", "software", "other"].map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
            <Field label="Amount ₹"><Input name="amount" type="number" min={1} step="0.01" required /></Field>
            <Field label="GST paid ₹"><Input name="gst_paid" type="number" min={0} step="0.01" defaultValue={0} /></Field>
            <Field label="Paid via"><Select name="paid_via" defaultValue="upi"><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="netbanking">NetBanking</option></Select></Field>
            <Field label="Note"><Input name="note" placeholder="Electricity bill" /></Field>
            <div className="col-span-2"><SubmitButton>Add expense</SubmitButton></div>
          </form>
          <ul className="mt-3 space-y-1 text-xs" data-expenses>
            {(expenses ?? []).slice(0, 12).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{fmtDate(e.spent_on)} · <span className="capitalize">{e.category}</span>{e.note ? ` · ${e.note}` : ""}</span>
                <span className="flex shrink-0 items-center gap-2">{inr(e.amount)}<form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><button className="text-red-600 hover:underline" aria-label="Delete expense">×</button></form></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="GST returns (draft)">
          <form action={prepareGst} className="mb-3 flex items-end gap-2">
            <Field label="Period"><Input name="period" type="month" defaultValue={period} /></Field>
            <SubmitButton>Prepare</SubmitButton>
          </form>
          {g ? (
            <div className="space-y-3 text-sm">
              {ret?.notes && <p className="rounded bg-ivory-100 p-2 text-xs">{ret.notes}</p>}
              <table className="w-full text-xs">
                <thead><tr className="text-brand-900/55"><th className="text-left">GSTR-3B</th><th>CGST</th><th>SGST</th><th>IGST</th></tr></thead>
                <tbody>
                  {([["3.1(a) Output tax", g.outward_taxable], ["4(A) ITC available", g.itc_available], ...(g.itc_reversed ? [["4(B) ITC reversed, Rule 42", g.itc_reversed] as const] : []), ["Payable in cash", g.tax_payable_cash], ["Credit c/f", g.credit_carried_forward]] as const).map(([l, r]) => (
                    <tr key={l} className="border-t"><td className="py-1">{l}</td><td className="text-center">{inr(r.cgst)}</td><td className="text-center">{inr(r.sgst)}</td><td className="text-center">{inr(r.igst)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-brand-900/55">Outward taxable value: {inr(g.outward_taxable.taxable)}</p>
              {g1 && (
                <>
                  <p className="font-semibold">GSTR-1 · B2CS</p>
                  <ul className="text-xs">{g1.b2cs.map((r, k) => <li key={k}>POS {r.pos} {stateName(r.pos)} @ {r.rate}%: {inr(r.taxable)} (tax {inr(r.cgst + r.sgst + r.igst)})</li>)}</ul>
                  <p className="font-semibold">HSN/SAC summary</p>
                  <ul className="text-xs">{g1.hsn.map((h) => <li key={h.code}>{h.code} ({h.kind}) qty {h.qty}: {inr(h.taxable)} + {inr(h.tax)}</li>)}</ul>
                  <p className="text-xs">Documents: {g1.docs.count} ({g1.docs.from ?? "—"} → {g1.docs.to ?? "—"})</p>
                </>
              )}
              <a className="text-xs text-brand-600 hover:underline" href={`/api/gst/${period}`}>Download JSON</a>
            </div>
          ) : <p className="text-sm text-brand-900/40">No draft for {period} yet.</p>}
        </Card>
      </div>
    </>
  );
}
