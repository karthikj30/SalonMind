import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addClient, eraseClient, importClientsCsv, logPastVisitAction } from "../actions";
import { LANGUAGES } from "@/lib/ai/llm";
import { addDays, fmtDate, inr, todayIst } from "@/lib/time";

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const { data: clients } = await db.from("clients").select("*").eq("tenant_id", tenant.id).order("churn_risk", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data: counts } = await db.from("bookings").select("client_id, status").eq("tenant_id", tenant.id);
  const [{ data: services }, { data: staff }] = await Promise.all([
    db.from("services").select("id, name").eq("tenant_id", tenant.id).order("name"),
    db.from("staff").select("id, name").eq("tenant_id", tenant.id).order("name"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Clients & growth" title="Clients" subtitle="Churn risk and personal visit cycle are recomputed by the Churn Analytics Agent from completed visits, reviews and no-shows." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`All clients (${clients?.length ?? 0})`} className="lg:col-span-2">
          <Table head={["Name", "Phone", "Lang", "Visits", "Cycle", "Last visit", "Churn risk", "Wallet / pts", "Consent", ""]} empty="No clients yet. They're also created automatically from bookings, the inbox and the marketplace.">
            {(clients ?? []).map((c) => {
              const mine = (counts ?? []).filter((b) => b.client_id === c.id);
              return (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td><Td>{c.phone ?? "—"}</Td><Td>{c.language}</Td>
                  <Td>{mine.filter((b) => b.status === "completed").length}{mine.some((b) => b.status === "no_show") && <span className="text-xs text-red-600"> ({mine.filter((b) => b.status === "no_show").length} NS)</span>}</Td>
                  <Td>{c.avg_cycle_days ? `${c.avg_cycle_days}d` : "—"}</Td><Td>{fmtDate(c.last_visit_at)}</Td>
                  <Td>{c.churn_risk === null ? "—" : <Badge tone={c.churn_risk >= 0.6 ? "red" : c.churn_risk >= 0.35 ? "amber" : "green"}>{Math.round(c.churn_risk * 100)}%</Badge>}</Td>
                  <Td className="text-xs">{inr(c.wallet_balance)} / {c.loyalty_points}</Td>
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
            <Field label="Birthday" hint="for birthday-week offers"><Input name="birthday" type="date" /></Field>
            <Field label="Referred by"><Select name="referred_by" defaultValue=""><option value="">—</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Notes"><Textarea name="notes" placeholder="Allergic to ammonia; prefers Priya" /></Field>
            <label className="flex items-center gap-2 text-xs text-brand-900/65"><input type="checkbox" name="consent" defaultChecked /> Client consents to marketing messages (DPDP)</label>
            <SubmitButton>Add client</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-brand-900/40">DPDP Act: “Export” downloads all data held about a client; “Erase” anonymises personal data while retaining de-identified tax records.</p>
        </Card>
        <Card title="Import clients from CSV (Fresha, Vagaro, Booksy, Square, Excel)" className="lg:col-span-3">
          <form action={importClientsCsv} className="flex flex-wrap items-end gap-3">
            <Field label="CSV file"><input type="file" name="file" accept=".csv,text/csv" className="text-sm" /></Field>
            <Field label="…or paste CSV" className="min-w-[280px] flex-1"><Textarea name="csv" rows={2} placeholder={"Name,Mobile,Email,Date of Birth\nAsha Rao,9876543210,asha@x.in,15/08/1994"} /></Field>
            <label className="flex items-center gap-2 text-xs text-brand-900/65"><input type="checkbox" name="consent" /> These clients consented to marketing</label>
            <SubmitButton>Import</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-brand-900/40">Recognises columns like Name / First Name + Last Name, Mobile / Phone, Email, Birthday / Date of Birth (DD/MM/YYYY), Notes. 10-digit numbers get +91. Existing phones are skipped.</p>
        </Card>
        <Card title="Import past visit (visit history)" className="lg:col-span-3">
          <p className="mb-2 text-xs text-brand-900/55">Migrating from a register or another app? Record past visits so agents learn each client&apos;s cycle immediately (e.g. haircuts 12, 8 and 4 weeks ago → the Campaign Agent sends a week-5 offer). Imported visits create no invoice and move no stock.</p>
          <form action={logPastVisitAction} className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Field label="Client" className="sm:col-span-2"><Select name="client_id" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Service" className="sm:col-span-2"><Select name="service_id" required>{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Stylist"><Select name="staff_id" defaultValue=""><option value="">—</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Date"><Input name="date" type="date" required max={addDays(todayIst(), -1)} /></Field>
            <Field label="Price ₹"><Input name="price" type="number" placeholder="base" /></Field>
            <Field label="Rating"><Select name="rating" defaultValue=""><option value="">—</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★</option>)}</Select></Field>
            <Field label="Review (optional)" className="sm:col-span-3"><Input name="review" /></Field>
            <div className="flex items-end"><SubmitButton>Import visit</SubmitButton></div>
          </form>
        </Card>
      </div>
    </>
  );
}
