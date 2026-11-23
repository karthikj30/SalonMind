import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createPackagePlan, createPlan, sellGiftCardAction, sellMembership, sellPackageAction, voidGiftCard, walletTopup } from "../actions";
import { packageSaving } from "@/lib/domain/prepaid";
import { Gift, Package } from "lucide-react";
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
  const [{ data: gifts }, { data: pkgPlans }, { data: clientPkgs }, { data: services }] = await Promise.all([
    db.from("gift_cards").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(40),
    db.from("package_plans").select("*, services(name, base_price)").eq("tenant_id", tenant.id).eq("active", true).order("price"),
    db.from("client_packages").select("*, clients(name), package_plans(name), services(name)").eq("tenant_id", tenant.id).order("expires_at", { ascending: false }).limit(50),
    db.from("services").select("id, name, base_price").eq("tenant_id", tenant.id).eq("active", true).order("name"),
  ]);
  const today = todayIst();
  const s = tenant.settings;
  return (
    <>
      <PageHeader eyebrow="Clients & growth" title="Memberships, Gift cards & Loyalty" subtitle={`Prepaid memberships (auto-discount at checkout), gift cards, prepaid service packages, prepaid wallet, and loyalty points (${s.loyalty_points_per_100} pt per ₹100, 1 pt = ₹1, max ${s.loyalty_max_redeem_pct}% of a bill). Referrers earn ${s.referral_bonus_points} pts when their friend completes a first visit — handled by the Loyalty & Referral Agent.`} />
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
        <Card title="Gift cards" icon={<Gift className="h-4 w-4" />} className="lg:col-span-2">
          <Table head={["Code", "For", "Value", "Balance", "Valid until", "Status", ""]} empty="No gift cards sold yet. They are paid for now and redeemed at checkout with the code.">
            {(gifts ?? []).map((g) => {
              const st = g.status === "active" && g.expires_at < today ? "expired" : g.status;
              return (
                <tr key={g.id}>
                  <Td className="font-mono text-xs">{g.code}</Td>
                  <Td>{g.recipient_name || g.buyer_name || "—"}</Td><Td>{inr(g.amount)}</Td><Td>{inr(g.balance)}</Td><Td>{fmtDate(g.expires_at)}</Td>
                  <Td><Badge tone={st === "active" ? "green" : st === "redeemed" ? "blue" : "amber"}>{st}</Badge></Td>
                  <Td>{st === "active" && <form action={voidGiftCard}><input type="hidden" name="id" value={g.id} /><SubmitButton variant="ghost" className="text-xs">Cancel</SubmitButton></form>}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Sell gift card">
          <form action={sellGiftCardAction} className="grid grid-cols-2 gap-2">
            <Field label="Amount ₹"><Input name="amount" type="number" min={1} required /></Field>
            <Field label="Valid (days)"><Input name="validity_days" type="number" min={30} defaultValue={365} /></Field>
            <Field label="Buyer name"><Input name="buyer_name" /></Field>
            <Field label="Buyer mobile"><Input name="buyer_phone" type="tel" placeholder="+91…" /></Field>
            <Field label="Recipient name"><Input name="recipient_name" /></Field>
            <Field label="Recipient mobile"><Input name="recipient_phone" type="tel" placeholder="+91…" /></Field>
            <Field label="Message" className="col-span-2"><Input name="message" placeholder="Happy birthday!" maxLength={200} /></Field>
            <Field label="Paid via"><Select name="payment_method">{PAY}</Select></Field>
            <div className="flex items-end"><SubmitButton>Issue & send</SubmitButton></div>
            <p className="col-span-2 text-[11px] text-brand-900/50">No GST now — a gift card is a voucher; GST is charged on the service when it is redeemed. The code goes to the recipient (or buyer) on WhatsApp.</p>
          </form>
        </Card>
        <Card title="Prepaid packages" icon={<Package className="h-4 w-4" />} className="lg:col-span-2">
          <Table head={["Package", "Service", "Sessions", "Price", "Client saves", "Validity"]} empty="No packages yet — e.g. “5 haircuts for the price of 4”.">
            {(pkgPlans ?? []).map((p) => {
              const sv = p.services as { name: string; base_price: number } | null;
              const sav = packageSaving({ sessions: p.sessions, price: Number(p.price), servicePrice: Number(sv?.base_price ?? 0) });
              return <tr key={p.id}><Td className="font-medium">{p.name}</Td><Td>{sv?.name}</Td><Td>{p.sessions}</Td><Td>{inr(p.price)}</Td><Td>{sav.saving > 0 ? inr(sav.saving) : "—"}</Td><Td>{p.validity_days} days</Td></tr>;
            })}
          </Table>
          <h4 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-brand-900/50">Sold packages</h4>
          <Table head={["Client", "Package", "Sessions left", "Valid until"]} empty="No packages sold yet.">
            {(clientPkgs ?? []).map((c) => <tr key={c.id}><Td>{c.clients?.name}</Td><Td>{c.package_plans?.name} · {c.services?.name}</Td><Td>{c.sessions_left}/{c.sessions_total}</Td><Td>{c.expires_at >= today ? fmtDate(c.expires_at) : <Badge>expired</Badge>}</Td></tr>)}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="Create package">
            <form action={createPackagePlan} className="grid grid-cols-2 gap-2">
              <Field label="Name" className="col-span-2"><Input name="name" required placeholder="5 haircuts" /></Field>
              <Field label="Service" className="col-span-2"><Select name="service_id" required>{(services ?? []).map((sv) => <option key={sv.id} value={sv.id}>{sv.name} · {inr(sv.base_price)}</option>)}</Select></Field>
              <Field label="Sessions"><Input name="sessions" type="number" min={1} max={100} defaultValue={5} /></Field>
              <Field label="Price ₹ (pre-GST)"><Input name="price" type="number" min={0} required /></Field>
              <Field label="Validity (days)"><Input name="validity_days" type="number" min={1} defaultValue={180} /></Field>
              <div className="flex items-end"><SubmitButton>Create</SubmitButton></div>
            </form>
          </Card>
          <Card title="Sell package">
            <form action={sellPackageAction} className="space-y-2">
              <Field label="Client"><Select name="client_id" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ?? ""}</option>)}</Select></Field>
              <Field label="Package"><Select name="plan_id" required>{(pkgPlans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {inr(p.price)}</option>)}</Select></Field>
              <Field label="Paid via"><Select name="payment_method">{PAY}</Select></Field>
              <SubmitButton>Sell & invoice</SubmitButton>
              <p className="text-[11px] text-brand-900/50">GST is invoiced now; each visit for that service then uses one session at ₹0.</p>
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
