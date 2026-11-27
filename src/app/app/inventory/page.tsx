import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addProduct, addVendor, logUsage, runAgentNow, setPoStatus } from "../actions";
import { STATES } from "@/lib/states";
import { fmtDateTime, inr } from "@/lib/time";

export default async function Inventory({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: products }, { data: vendors }, { data: pos }, { data: negs }, { data: logs }, { data: recent }, { data: forecast }] = await Promise.all([
    db.from("products").select("*, vendors(name)").eq("tenant_id", tenant.id).order("name"),
    db.from("vendors").select("*").eq("tenant_id", tenant.id).order("name"),
    db.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(20),
    db.from("negotiations").select("*").eq("tenant_id", tenant.id),
    db.from("usage_logs").select("*, products(name, unit), staff(name)").eq("tenant_id", tenant.id).neq("source", "auto").order("created_at", { ascending: false }).limit(15),
    db.from("bookings").select("id, start_at, clients(name), services(name)").eq("tenant_id", tenant.id).eq("status", "completed").order("start_at", { ascending: false }).limit(20),
    db.from("agent_runs").select("output, created_at").eq("tenant_id", tenant.id).eq("agent", "inventory").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fc = (forecast?.output ?? []) as { product: string; daily: number; days_left: number | null; seasonal: number; reorder: number }[];
  return (
    <>
      <PageHeader eyebrow="Operations" title="Inventory & Procurement" subtitle="The Procurement Agent forecasts depletion (usage history + booked services × recipes × festival demand) and drafts POs; the Negotiation Agent haggles using vendor tiers & learned flexibility; the Waste Agent flags excessive usage.">
        <form action={runAgentNow}><input type="hidden" name="agent" value="inventory" /><SubmitButton pendingText="Forecasting…">Run Procurement Agent</SubmitButton></form>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Stock" className="lg:col-span-2">
          <Table head={["Product", "Vendor", "Stock", "Reorder at", "Cost / retail", "GST", "Forecast"]} empty="No products yet.">
            {(products ?? []).map((p) => {
              const f = fc.find((x) => x.product === p.name);
              return (
                <tr key={p.id}>
                  <Td className="font-medium">{p.name}<div className="text-xs font-normal text-brand-900/55">{p.brand}</div></Td><Td>{p.vendors?.name ?? "—"}</Td>
                  <Td>{Number(p.stock_qty) <= Number(p.reorder_level) ? <Badge tone="red">{p.stock_qty} {p.unit}</Badge> : `${p.stock_qty} ${p.unit}`}</Td>
                  <Td>{p.reorder_level}</Td><Td>{inr(p.unit_cost)} / {inr(p.retail_price)}</Td><Td>{p.gst_rate}%</Td>
                  <Td className="text-xs">{f ? `${f.daily}/day · ${f.days_left ?? "∞"}d left · ×${f.seasonal}` : "run agent"}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Add product">
          <form action={addProduct} className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input name="name" required placeholder="Ammonia-free colour 6.0" /></Field>
            <Field label="Brand"><Input name="brand" /></Field>
            <Field label="Unit"><Select name="unit">{["ml", "g", "pcs", "bottle", "tube"].map((u) => <option key={u}>{u}</option>)}</Select></Field>
            <Field label="Vendor" className="col-span-2"><Select name="vendor_id" defaultValue=""><option value="">—</option>{(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <Field label="Stock qty"><Input name="stock_qty" type="number" step="0.1" required /></Field>
            <Field label="Reorder level"><Input name="reorder_level" type="number" step="0.1" required /></Field>
            <Field label="Unit cost ₹"><Input name="unit_cost" type="number" step="0.01" required /></Field>
            <Field label="Retail price ₹"><Input name="retail_price" type="number" step="0.01" /></Field>
            <Field label="GST %" hint="Shampoo, hair oil 5%; hair dye, most cosmetics 18% (since 22 Sep 2025)"><Select name="gst_rate" defaultValue="18">{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Field>
            <Field label="HSN"><Input name="hsn" defaultValue="3305" /></Field>
            <Field label="Lead time (days)"><Input name="lead_time_days" type="number" defaultValue={3} /></Field>
            <div className="col-span-2"><SubmitButton>Add product</SubmitButton></div>
          </form>
        </Card>
        <Card title="Purchase orders" className="lg:col-span-2">
          {(pos ?? []).length === 0 && <p className="text-sm text-brand-900/40">No POs yet. Run the Procurement Agent once products are low or have usage.</p>}
          <div className="space-y-3">
            {(pos ?? []).map((po) => {
              const neg = (negs ?? []).find((n) => n.po_id === po.id);
              return (
                <div key={po.id} className="rounded-xl border border-brand-100 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><b>{po.vendors?.name ?? "No vendor"}</b> · {fmtDateTime(po.created_at)} · <Badge tone={statusTone(po.status)}>{po.status}</Badge> {po.is_interstate && <Badge tone="violet">IGST</Badge>} <span className="text-xs text-brand-900/55">{po.created_by}</span></div>
                    <div className="font-semibold">{inr(po.total)} <span className="text-xs font-normal text-brand-900/55">(GST {inr(po.gst_amount)})</span></div>
                  </div>
                  <ul className="mt-1 text-xs text-brand-900/65">{(po.items as { name: string; qty: number; unit: string; unit_cost: number }[]).map((i, k) => <li key={k}>{i.name}: {i.qty} {i.unit} × {inr(i.unit_cost)}</li>)}</ul>
                  {po.ai_reasoning && <pre className="mt-1 whitespace-pre-wrap rounded bg-ivory-100 p-2 text-[11px] text-brand-900/65">{po.ai_reasoning}</pre>}
                  {neg && (
                    <details className="mt-1 text-xs"><summary className="cursor-pointer text-violet-700">Negotiation thread ({inr(neg.original_total)} → {inr(neg.negotiated_total)})</summary>
                      {(neg.messages as { from: string; body: string }[]).map((m, k) => <div key={k} className="mt-1 rounded bg-ivory-100 p-2"><b>{m.from}:</b> <span className="whitespace-pre-wrap">{m.body}</span></div>)}
                    </details>
                  )}
                  <div className="mt-2 flex gap-3 text-xs">
                    {po.status === "draft" && <form action={setPoStatus}><input type="hidden" name="id" value={po.id} /><input type="hidden" name="status" value="approved" /><button className="text-emerald-700 hover:underline">Approve</button></form>}
                    {["draft", "approved"].includes(po.status) && <form action={setPoStatus}><input type="hidden" name="id" value={po.id} /><input type="hidden" name="status" value="received" /><button className="text-sky-700 hover:underline">Mark received (adds stock, ITC)</button></form>}
                    {po.status !== "received" && po.status !== "cancelled" && <form action={setPoStatus}><input type="hidden" name="id" value={po.id} /><input type="hidden" name="status" value="cancelled" /><button className="text-brand-900/55 hover:underline">Cancel</button></form>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Add vendor">
            <form action={addVendor} className="grid grid-cols-2 gap-2">
              <Field label="Name" className="col-span-2"><Input name="name" required /></Field>
              <Field label="Email"><Input name="email" type="email" /></Field>
              <Field label="Phone"><Input name="phone" type="tel" inputMode="tel" /></Field>
              <Field label="GSTIN"><Input name="gstin" /></Field>
              <Field label="State"><Select name="state_code" defaultValue={tenant.state_code ?? ""}>{STATES.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}</Select></Field>
              <Field label="Flexibility 0–1" hint="prior for negotiation"><Input name="flexibility" type="number" step="0.05" min={0} max={1} defaultValue={0.5} /></Field>
              <Field label="Bulk tiers (JSON)" className="col-span-2"><Textarea name="price_tiers" defaultValue='[{"min_qty":10,"discount_pct":5},{"min_qty":50,"discount_pct":10}]' /></Field>
              <div className="col-span-2"><SubmitButton>Add vendor</SubmitButton></div>
            </form>
          </Card>
          <Card title="Smart-scale / manual usage log">
            <form action={logUsage} className="grid grid-cols-2 gap-2">
              <Field label="Product" className="col-span-2"><Select name="product_id" required>{(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</Select></Field>
              <Field label="For booking (optional)" className="col-span-2" hint="expected qty comes from the service recipe"><Select name="booking_id" defaultValue=""><option value="">—</option>{(recent ?? []).map((b: any) => <option key={b.id} value={b.id}>{fmtDateTime(b.start_at)} {b.clients?.name} · {b.services?.name}</option>)}</Select></Field>
              <Field label="Actual qty"><Input name="actual_qty" type="number" step="0.1" required /></Field>
              <Field label="Expected (if no booking)"><Input name="expected_qty" type="number" step="0.1" /></Field>
              <div className="col-span-2"><SubmitButton>Log usage</SubmitButton></div>
            </form>
            <ul className="mt-3 space-y-1 text-xs">{(logs ?? []).map((l) => <li key={l.id} className={l.flagged ? "text-red-600" : "text-brand-900/65"}>{l.flagged ? "⚠ " : ""}{l.staff?.name ?? "—"} · {l.products?.name}: {l.actual_qty}/{l.expected_qty} {l.products?.unit}</li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
