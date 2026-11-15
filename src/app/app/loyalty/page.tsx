import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createPlan, sellMembership, walletTopup } from "../actions";
import { fmtDate, fmtDateTime, inr, todayIst } from "@/lib/time";

const PAY = <><option value="upi">UPI</option><option value="card">Card</option><option value="netbanking">NetBanking</option><option value="cash">Cash</option></>;

export default async function Loyalty({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: plans }, { data: members }, { data: clients }, { data: tx }] = await Promise.all([
    db.from("membership_plans").select("*").eq("tenant_id", tenant.id).order("price"),
    db.from("client_memberships").select("*, clients(name), membership_plans(name, discount_pct)").eq("tenant_id", tenant.id).order("ends_at", { ascending: false }).limit(50),
    db.from("clients").select("id, name, phone, wallet_balance, loyalty_points").eq("tenant_id", tenant.id).order("name"),
    db.from("wallet_transactions").select("*, clients(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(40),
  ]);
  const today = todayIst();
  const s = tenant.settings;
  return (
    <>
      <PageHeader title="Memberships, Wallet & Loyalty" subtitle={`Prepaid memberships (auto-discount at checkout), prepaid wallet, and loyalty points (${s.loyalty_points_per_100} pt per ₹100, 1 pt = ₹1, max ${s.loyalty_max_redeem_pct}% of a bill). Referrers earn ${s.referral_bonus_points} pts when their friend completes a first visit — handled by the Loyalty & Referral Agent.`} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Membership plans" className="lg:col-span-2">
          <Table head={["Plan", "Price", "Discount", "Validity", "Wallet credit"]} empty="No plans yet — e.g. “Gold: ₹4,999, 20% off, 1 year, ₹1,000 wallet credit”.">
            {(plans ?? []).map((p) => <tr key={p.id}><Td className="font-medium">{p.name}</Td><Td>{inr(p.price)}</Td><Td>{p.discount_pct}%</Td><Td>{p.validity_days} days</Td><Td>{inr(p.wallet_credit)}</Td></tr>)}
          </Table>
        </Card>
        <Card title="Create plan">
          <form action={createPlan} className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input name="name" required placeholder="Gold membership" /></Field>
            <Field label="Price ₹ (pre-GST)"><Input name="price" type="number" required /></Field>
            <Field label="Discount %"><Input name="discount_pct" type="number" min={0} max={100} defaultValue={15} /></Field>
            <Field label="Validity (days)"><Input name="validity_days" type="number" defaultValue={365} /></Field>
            <Field label="Wallet credit ₹"><Input name="wallet_credit" type="number" defaultValue={0} /></Field>
            <div className="col-span-2"><SubmitButton>Create</SubmitButton></div>
          </form>
        </Card>
        <Card title="Members" className="lg:col-span-2">
          <Table head={["Client", "Plan", "Valid until", "Status"]} empty="No memberships sold yet.">
            {(members ?? []).map((m) => <tr key={m.id}><Td>{m.clients?.name}</Td><Td>{m.membership_plans?.name} ({m.membership_plans?.discount_pct}% off)</Td><Td>{fmtDate(m.ends_at)}</Td><Td>{m.ends_at >= today ? <Badge tone="green">active</Badge> : <Badge>expired</Badge>}</Td></tr>)}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="Sell membership">
            <form action={sellMembership} className="space-y-2">
              <Field label="Client"><Select name="client_id" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ?? ""}</option>)}</Select></Field>
              <Field label="Plan"><Select name="plan_id" required>{(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {inr(p.price)}</option>)}</Select></Field>
              <Field label="Paid via"><Select name="payment_method">{PAY}</Select></Field>
              <SubmitButton>Sell & invoice</SubmitButton>
            </form>
          </Card>
          <Card title="Top up prepaid wallet">
            <form action={walletTopup} className="space-y-2">
              <Field label="Client"><Select name="client_id" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · wallet {inr(c.wallet_balance)}</option>)}</Select></Field>
              <Field label="Amount ₹"><Input name="amount" type="number" min={1} required /></Field>
              <Field label="Paid via"><Select name="payment_method">{PAY}</Select></Field>
              <SubmitButton>Top up</SubmitButton>
            </form>
          </Card>
        </div>
        <Card title="Balances" className="lg:col-span-1">
          <Table head={["Client", "Wallet", "Points"]}>
            {(clients ?? []).filter((c) => Number(c.wallet_balance) > 0 || c.loyalty_points > 0).map((c) => <tr key={c.id}><Td>{c.name}</Td><Td>{inr(c.wallet_balance)}</Td><Td>{c.loyalty_points}</Td></tr>)}
          </Table>
        </Card>
        <Card title="Ledger (wallet & points)" className="lg:col-span-2">
          <Table head={["When", "Client", "Kind", "₹", "Points", "Note"]} empty="No transactions yet.">
            {(tx ?? []).map((t) => <tr key={t.id}><Td className="text-xs">{fmtDateTime(t.created_at)}</Td><Td>{t.clients?.name}</Td><Td><Badge tone={t.kind.includes("redeem") || t.kind === "spend" ? "amber" : "green"}>{t.kind}</Badge></Td><Td>{Number(t.amount) ? inr(t.amount) : "—"}</Td><Td>{t.points || "—"}</Td><Td className="text-xs">{t.note}</Td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
