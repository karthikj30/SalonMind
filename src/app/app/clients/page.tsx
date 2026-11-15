import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addClient, eraseClient } from "../actions";
import { LANGUAGES } from "@/lib/ai/llm";
import { fmtDate } from "@/lib/time";

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const { data: clients } = await db.from("clients").select("*").eq("tenant_id", tenant.id).order("churn_risk", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data: counts } = await db.from("bookings").select("client_id, status").eq("tenant_id", tenant.id);
  return (
    <>
      <PageHeader title="Clients" subtitle="Churn risk and personal visit cycle are recomputed by the Churn Analytics Agent from completed visits, reviews and no-shows." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`All clients (${clients?.length ?? 0})`} className="lg:col-span-2">
          <Table head={["Name", "Phone", "Lang", "Visits", "Cycle", "Last visit", "Churn risk", "Consent", ""]} empty="No clients yet. They're also created automatically from bookings, the inbox and the marketplace.">
            {(clients ?? []).map((c) => {
              const mine = (counts ?? []).filter((b) => b.client_id === c.id);
              return (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td><Td>{c.phone ?? "—"}</Td><Td>{c.language}</Td>
                  <Td>{mine.filter((b) => b.status === "completed").length}{mine.some((b) => b.status === "no_show") && <span className="text-xs text-red-600"> ({mine.filter((b) => b.status === "no_show").length} NS)</span>}</Td>
                  <Td>{c.avg_cycle_days ? `${c.avg_cycle_days}d` : "—"}</Td><Td>{fmtDate(c.last_visit_at)}</Td>
                  <Td>{c.churn_risk === null ? "—" : <Badge tone={c.churn_risk >= 0.6 ? "red" : c.churn_risk >= 0.35 ? "amber" : "green"}>{Math.round(c.churn_risk * 100)}%</Badge>}</Td>
                  <Td>{c.consent_marketing ? "✔" : "✘"}</Td>
                  <Td>
                    <div className="flex gap-2 text-xs">
                      <a className="text-brand-600 hover:underline" href={`/api/clients/${c.id}/export`}>Export</a>
                      <form action={eraseClient}><input type="hidden" name="id" value={c.id} /><button className="text-red-600 hover:underline">Erase</button></form>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Add client">
          <form action={addClient} className="space-y-2">
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Phone (WhatsApp)"><Input name="phone" placeholder="+919876543210" /></Field>
            <Field label="Email"><Input name="email" type="email" /></Field>
            <Field label="Preferred language" hint="AI messages are written in this language"><Select name="language">{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Notes"><Textarea name="notes" placeholder="Allergic to ammonia; prefers Priya" /></Field>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="consent" defaultChecked /> Client consents to marketing messages (DPDP)</label>
            <SubmitButton>Add client</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-slate-400">DPDP Act: “Export” downloads all data held about a client; “Erase” anonymises personal data while retaining de-identified tax records.</p>
        </Card>
      </div>
    </>
  );
}
