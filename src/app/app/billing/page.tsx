import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { prepareGst } from "../actions";
import { fmtDate, inr, todayIst } from "@/lib/time";
import { stateName } from "@/lib/states";

type R3b = { outward_taxable: Record<string, number>; itc_available: Record<string, number>; tax_payable_cash: Record<string, number>; credit_carried_forward: Record<string, number> };

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const period = sp.period || todayIst().slice(0, 7);
  const [{ data: invoices }, { data: ret }] = await Promise.all([
    db.from("invoices").select("*, clients(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100),
    db.from("gst_returns").select("*").eq("tenant_id", tenant.id).eq("period", period).maybeSingle(),
  ]);
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
                  {([["3.1(a) Output tax", g.outward_taxable], ["4(A) ITC available", g.itc_available], ["Payable in cash", g.tax_payable_cash], ["Credit c/f", g.credit_carried_forward]] as const).map(([l, r]) => (
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
