import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Beaker, FlaskConical, ShieldCheck } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addFormula, addPatchTest, setPatchResult } from "../../actions";
import { needsPatchTest, patchTestStatus, latestTestDate, type PatchTest } from "@/lib/domain/consultation";
import { fmtDate, fmtDateTime, inr, todayIst } from "@/lib/time";

const TONE = { ok: "green", too_soon: "amber", failed: "red", expired: "amber", missing: "amber" } as const;
const LABEL = { ok: "Cleared", too_soon: "Wait for result / 48 h", failed: "Reacted — do not colour", expired: "Re-test needed", missing: "No test on file" } as const;

/** Client consultation card: visit history, colour formulas and allergy (patch) tests in one place. */
export default async function ClientCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const { data: client } = await db.from("clients").select("*").eq("id", id).eq("tenant_id", tenant.id).maybeSingle();
  if (!client) notFound();
  const [{ data: formulas }, { data: tests }, { data: bookings }, { data: services }, { data: staff }] = await Promise.all([
    db.from("client_formulas").select("*, services(name), staff(name)").eq("client_id", id).eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    db.from("patch_tests").select("*, staff(name)").eq("client_id", id).eq("tenant_id", tenant.id).order("tested_on", { ascending: false }),
    db.from("bookings").select("id, start_at, status, price, services(name, category), staff(name)").eq("client_id", id).eq("tenant_id", tenant.id).order("start_at", { ascending: false }).limit(30),
    db.from("services").select("id, name, category").eq("tenant_id", tenant.id).order("name"),
    db.from("staff").select("id, name").eq("tenant_id", tenant.id).eq("active", true).order("name"),
  ]);
  const now = new Date();
  const upcomingColour = (bookings ?? []).filter((b) => ["booked", "confirmed"].includes(b.status) && new Date(b.start_at) > now)
    .filter((b) => needsPatchTest((b.services as unknown as { name: string; category: string }) ?? {}))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const next = upcomingColour[0];
  const st = patchTestStatus((tests ?? []) as PatchTest[], next ? new Date(next.start_at) : now);
  const colourServices = (services ?? []).filter((s) => needsPatchTest(s));

  return (
    <>
      <Link href="/app/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" />Clients</Link>
      <PageHeader eyebrow="Consultation card" title={client.name} subtitle={`${client.phone ?? "No phone"} · ${client.language} · wallet ${inr(client.wallet_balance)} · ${client.loyalty_points} pts${client.last_visit_at ? ` · last visit ${fmtDate(client.last_visit_at)}` : ""}`} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Patch test status" icon={<ShieldCheck className="h-4 w-4" />} className="lg:col-span-3">
          <div className="flex flex-wrap items-center gap-3 text-sm" data-patch-status={st.status}>
            <Badge tone={TONE[st.status]}>{LABEL[st.status]}</Badge>
            {st.latest && <span>Last test {fmtDate(st.latest.tested_on)} · {st.latest.result}</span>}
            {next ? <span className="text-brand-900/60">Next colour visit: {(next.services as unknown as { name: string })?.name} on {fmtDateTime(next.start_at)}{st.status !== "ok" && st.status !== "failed" ? ` — test by ${fmtDate(latestTestDate(new Date(next.start_at)))}` : ""}</span>
              : <span className="text-brand-900/60">Colour services need a passed skin test at least 48 h before, renewed every 12 months. The Consultation & Safety Agent reminds clients automatically.</span>}
          </div>
        </Card>
        <Card title="Colour formulas" icon={<Beaker className="h-4 w-4" />} className="lg:col-span-2">
          <Table head={["Date", "Service", "Formula", "Developer", "Time", "Stylist", "Notes"]} empty="No formulas yet — save what you mixed so anyone can repeat the result.">
            {(formulas ?? []).map((f) => (
              <tr key={f.id}>
                <Td className="text-xs">{fmtDate(f.created_at)}</Td><Td>{f.services?.name ?? "—"}</Td>
                <Td className="font-mono text-xs">{f.formula}</Td><Td className="text-xs">{f.developer ?? "—"}</Td>
                <Td className="text-xs">{f.processing_min ? `${f.processing_min} min` : "—"}</Td><Td className="text-xs">{f.staff?.name ?? "—"}</Td><Td className="text-xs">{f.notes}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Save a formula">
          <form action={addFormula} className="space-y-2">
            <input type="hidden" name="client_id" value={id} />
            <Field label="Service"><Select name="service_id" defaultValue=""><option value="">—</option>{(colourServices.length ? colourServices : services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Formula"><Input name="formula" required placeholder="7.1 30g + 8.13 15g" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Developer"><Input name="developer" placeholder="6% / 20 vol" /></Field>
              <Field label="Processing (min)"><Input name="processing_min" type="number" min={0} max={240} /></Field>
            </div>
            <Field label="Stylist"><Select name="staff_id" defaultValue="">{[<option key="" value="">—</option>, ...(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)]}</Select></Field>
            <Field label="Notes"><Textarea name="notes" rows={2} placeholder="Roots only, toner after" /></Field>
            <SubmitButton>Save formula</SubmitButton>
          </form>
        </Card>
        <Card title="Patch tests" icon={<FlaskConical className="h-4 w-4" />} className="lg:col-span-2">
          <Table head={["Tested on", "Product", "Result", "By", "Notes", ""]} empty="No patch tests recorded.">
            {(tests ?? []).map((t) => (
              <tr key={t.id}>
                <Td>{fmtDate(t.tested_on)}</Td><Td>{t.product}</Td>
                <Td><Badge tone={t.result === "pass" ? "green" : t.result === "fail" ? "red" : "amber"}>{t.result}</Badge></Td>
                <Td className="text-xs">{t.staff?.name ?? "—"}</Td><Td className="text-xs">{t.notes}</Td>
                <Td>{t.result === "pending" && (
                  <div className="flex gap-1">
                    {(["pass", "fail"] as const).map((r) => (
                      <form key={r} action={setPatchResult}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="client_id" value={id} /><input type="hidden" name="result" value={r} />
                        <SubmitButton variant={r === "fail" ? "danger" : "ghost"} className="!px-2 !py-1 text-xs">{r === "pass" ? "No reaction" : "Reacted"}</SubmitButton></form>
                    ))}
                  </div>
                )}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Record a patch test">
          <form action={addPatchTest} className="space-y-2">
            <input type="hidden" name="client_id" value={id} />
            <Field label="Product / shade"><Input name="product" required placeholder="L'Oréal Majirel 7.1" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tested on"><Input name="tested_on" type="date" defaultValue={todayIst()} max={todayIst()} /></Field>
              <Field label="Result"><Select name="result" defaultValue="pending"><option value="pending">Pending (check in 48 h)</option><option value="pass">No reaction</option><option value="fail">Reacted</option></Select></Field>
            </div>
            <Field label="Stylist"><Select name="staff_id" defaultValue="">{[<option key="" value="">—</option>, ...(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)]}</Select></Field>
            <Field label="Notes"><Input name="notes" /></Field>
            <SubmitButton>Record test</SubmitButton>
          </form>
        </Card>
        <Card title="Visit history" className="lg:col-span-3">
          <Table head={["When", "Service", "Stylist", "Status", "Price"]} empty="No visits yet.">
            {(bookings ?? []).map((b) => <tr key={b.id}><Td className="text-xs">{fmtDateTime(b.start_at)}</Td><Td>{(b.services as unknown as { name: string })?.name}</Td><Td>{(b.staff as unknown as { name: string })?.name ?? "—"}</Td><Td><Badge>{b.status}</Badge></Td><Td>{inr(b.price)}</Td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
