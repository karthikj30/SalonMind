import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createDeal, runAgentNow, toggleDeal } from "../actions";
import { addDays, fmtDateTime, todayIst } from "@/lib/time";

export default async function Marketing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: campaigns }, { data: deals }, { data: services }] = await Promise.all([
    db.from("campaigns").select("*, clients(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(50),
    db.from("deals").select("*, services(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(50),
    db.from("services").select("id, name").eq("tenant_id", tenant.id).order("name"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Clients & growth" title="Campaigns & Deals" subtitle="The Campaign Agent messages clients who are overdue vs. their own visit cycle; the Yield Pricing Agent publishes flash / last-minute / festival deals to the marketplace.">
        <form action={runAgentNow}><input type="hidden" name="agent" value="retention" /><SubmitButton variant="secondary">Run Campaign Agent</SubmitButton></form>
        <form action={runAgentNow}><input type="hidden" name="agent" value="deals" /><SubmitButton variant="secondary">Run Yield Agent</SubmitButton></form>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Marketplace deals" className="lg:col-span-2">
          <Table head={["Deal", "Kind", "Service", "Off", "Valid to", "By", ""]} empty="No deals yet.">
            {(deals ?? []).map((d) => (
              <tr key={d.id} className={d.active && new Date(d.valid_to) > new Date() ? "" : "opacity-50"}>
                <Td><div className="font-medium">{d.title}</div><div className="text-xs text-brand-900/55">{d.description}</div></Td>
                <Td><Badge tone={d.kind === "festival" ? "pink" : d.kind === "last_minute" ? "red" : "blue"}>{d.kind}</Badge></Td>
                <Td>{d.services?.name ?? "—"}</Td><Td>{d.discount_pct}%</Td><Td className="text-xs">{fmtDateTime(d.valid_to)}</Td><Td className="text-xs">{d.created_by}</Td>
                <Td><form action={toggleDeal}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="active" value={String(d.active)} /><button className="text-xs text-brand-900/55 hover:text-brand-600">{d.active ? "Pause" : "Resume"}</button></form></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Create a deal manually">
          <form action={createDeal} className="space-y-2">
            <Field label="Title"><Input name="title" required placeholder="Monsoon hair spa 25% off" /></Field>
            <Field label="Service"><Select name="service_id">{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Discount %"><Input name="discount_pct" type="number" min={0} max={80} required /></Field>
            <Field label="Valid until"><Input name="valid_to" type="date" defaultValue={addDays(todayIst(), 7)} required /></Field>
            <Field label="Description"><Textarea name="description" /></Field>
            <SubmitButton>Publish</SubmitButton>
          </form>
        </Card>
        <Card title="Campaign log (AI-written messages)" className="lg:col-span-3">
          <Table head={["When", "Client", "Type", "Message", "Status"]} empty="No campaigns yet. They trigger when a client is overdue vs. their visit cycle, or churn risk ≥ 60%.">
            {(campaigns ?? []).map((c) => (
              <tr key={c.id}><Td className="whitespace-nowrap text-xs">{fmtDateTime(c.created_at)}</Td><Td>{c.clients?.name}</Td><Td><Badge tone={c.type === "churn_recovery" ? "red" : "blue"}>{c.type}</Badge></Td><Td className="max-w-xl text-xs">{c.message}</Td><Td><Badge tone="amber">{c.channel}</Badge></Td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
