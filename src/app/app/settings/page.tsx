import { getTenantContext } from "@/lib/tenant";
import { Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { reindexServices, updateSalon, updateSettings } from "../actions";
import { STATES } from "@/lib/states";
import { embeddingModel } from "@/lib/ai/embeddings";
import { LANGUAGES } from "@/lib/ai/llm";

const PARAMS: [string, string, string][] = [
  ["surge_cap_pct", "Surge cap %", "Max price increase in high-demand windows"],
  ["flash_discount_cap_pct", "Flash discount cap %", "Max auto-discount for empty slots"],
  ["nudge_threshold", "Nudge threshold (0–1)", "No-show risk above which a confirmation nudge is sent"],
  ["deposit_threshold", "Deposit threshold (0–1)", "No-show risk above which a deposit is required"],
  ["deposit_pct", "Deposit %", "Of the booking price"],
  ["reorder_buffer_days", "Reorder safety buffer (days)", "Added to vendor lead time"],
  ["retention_grace_days", "Retention grace (days)", "Overdue days beyond the client's cycle before an offer"],
  ["gst_rate", "GST on services %", "18% for salon services"],
];

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { tenant } = await getTenantContext();
  return (
    <>
      <PageHeader title="Settings" subtitle="Salon profile (also your public marketplace page) and the parameters agents operate within. The Self-Optimizing Agent tunes some of these automatically from your data." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Salon profile">
          <form action={updateSalon} className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input name="name" defaultValue={tenant.name} required /></Field>
            <Field label="City"><Input name="city" defaultValue={tenant.city ?? ""} /></Field>
            <Field label="State"><Select name="state" defaultValue={`${tenant.state_code}|${tenant.state}`}>{STATES.map(([c, n]) => <option key={c} value={`${c}|${n}`}>{c} {n}</option>)}</Select></Field>
            <Field label="GSTIN"><Input name="gstin" defaultValue={tenant.gstin ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={tenant.phone ?? ""} /></Field>
            <Field label="Opens"><Input name="open_time" type="time" defaultValue={tenant.open_time.slice(0, 5)} /></Field>
            <Field label="Closes"><Input name="close_time" type="time" defaultValue={tenant.close_time.slice(0, 5)} /></Field>
            <Field label="Address" className="col-span-2"><Input name="address" defaultValue={tenant.address ?? ""} /></Field>
            <Field label="Description" className="col-span-2"><Textarea name="description" defaultValue={tenant.description ?? ""} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={tenant.is_published} /> Listed on the consumer marketplace</label>
            <div className="col-span-2 flex items-center gap-3"><SubmitButton>Save</SubmitButton><a href={`/s/${tenant.slug}`} className="text-xs text-brand-600" target="_blank">View public page ↗</a></div>
          </form>
        </Card>
        <div className="space-y-4">
          <Card title="Agent parameters">
            <form action={updateSettings} className="grid grid-cols-2 gap-2">
              {PARAMS.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><Input name={k} type="number" step="0.01" defaultValue={String((tenant.settings as Record<string, unknown>)[k])} /></Field>)}
              <Field label="Default language"><Select name="default_language" defaultValue={tenant.settings.default_language}>{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <div className="col-span-2"><SubmitButton>Save parameters</SubmitButton></div>
            </form>
          </Card>
          <Card title="AI search index">
            <p className="mb-2 text-sm text-slate-600">Active embedding model: <code>{embeddingModel()}</code>. Re-index after adding a GEMINI_API_KEY to upgrade from local hashed embeddings to semantic embeddings.</p>
            <form action={reindexServices}><SubmitButton variant="secondary">Re-index services</SubmitButton></form>
          </Card>
          <Card title="Security & compliance">
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
              <li>Tenant isolation enforced in Postgres Row-Level Security on every table.</li>
              <li>Encryption: TLS in transit; AES-256 at rest (Supabase managed storage).</li>
              <li>DPDP: marketing consent per client, data export and right-to-erasure on the Clients page.</li>
              <li>AI agents only act through audited functions; every action is logged in the Agent Console.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
