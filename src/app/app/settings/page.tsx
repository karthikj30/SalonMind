import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";
import { SubmitButton } from "@/components/SubmitButton";
import { reindexServices, translateCatalogue, updateSalon, updateSettings } from "../actions";
import { catalogueStrings } from "@/lib/agents/i18n";
import { detectLang } from "@/lib/i18n/concierge";
import { sourceHash, TRANSLATE_LANGS } from "@/lib/domain/translate";
import { deleteMyAccount } from "../../auth-actions";
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
  ["gst_rate", "GST on services %", "5% for salon services since 22 Sep 2025 (no input tax credit)"],
  ["loyalty_points_per_100", "Loyalty points per ₹100", "1 point = ₹1 at redemption"],
  ["loyalty_max_redeem_pct", "Max points redemption %", "Of a bill"],
  ["referral_bonus_points", "Referral bonus points", "Credited to the referrer after the friend's first visit"],
];

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const audit = await db.from("audit_log").select("*").eq("tenant_id", tenant.id).order("at", { ascending: false }).limit(25);
  // Translation coverage of the public catalogue per language (Translator Agent)
  const strings = await catalogueStrings(db, tenant);
  const { data: trRows } = await db.from("translations").select("lang, source_hash, provider").eq("tenant_id", tenant.id).eq("is_public", true);
  const hashes = new Set(strings.map(sourceHash));
  const coverage = TRANSLATE_LANGS.map((l) => {
    const need = strings.filter((x) => detectLang(x) !== l).length;
    const have = (trRows ?? []).filter((r) => r.lang === l && hashes.has(r.source_hash)).length;
    return { l, need, have: Math.min(have, need) };
  }).filter((c) => c.need > 0);
  const trProviders = [...new Set((trRows ?? []).map((r) => r.provider))];
  return (
    <>
      <PageHeader eyebrow="AI" title="Settings" subtitle="Salon profile (also your public marketplace page) and the parameters agents operate within. The Self-Optimizing Agent tunes some of these automatically from your data." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Salon profile">
          <form action={updateSalon} className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input name="name" defaultValue={tenant.name} required /></Field>
            <Field label="City"><Input name="city" defaultValue={tenant.city ?? ""} /></Field>
            <Field label="State"><Select name="state" defaultValue={`${tenant.state_code}|${tenant.state}`}>{STATES.map(([c, n]) => <option key={c} value={`${c}|${n}`}>{c} {n}</option>)}</Select></Field>
            <Field label="GSTIN"><Input name="gstin" defaultValue={tenant.gstin ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" type="tel" inputMode="tel" defaultValue={tenant.phone ?? ""} /></Field>
            <Field label="Opens"><Input name="open_time" type="time" defaultValue={tenant.open_time.slice(0, 5)} /></Field>
            <Field label="Closes"><Input name="close_time" type="time" defaultValue={tenant.close_time.slice(0, 5)} /></Field>
            <Field label="Address" className="col-span-2"><Input name="address" defaultValue={tenant.address ?? ""} /></Field>
            <Field label="Description" className="col-span-2"><Textarea name="description" defaultValue={tenant.description ?? ""} /></Field>
            <Field label="UPI ID (VPA)" hint="Deposit & bill links/QR: upi://pay — works with any UPI app, zero fees" className="col-span-2"><Input name="upi_vpa" defaultValue={tenant.upi_vpa ?? ""} placeholder="glowstudio@okhdfcbank" /></Field>
            <Field label="Google review link" hint="Reputation Agent sends it to happy (4–5★) clients" className="col-span-2"><Input name="google_review_url" type="url" defaultValue={tenant.google_review_url ?? ""} placeholder="https://g.page/r/…/review" /></Field>
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
            <p className="mb-2 text-sm text-brand-900/65">Active embedding model: <code>{embeddingModel()}</code>. Re-index after adding a GEMINI_API_KEY to upgrade from local hashed embeddings to semantic embeddings.</p>
            <form action={reindexServices}><SubmitButton variant="secondary">Re-index services</SubmitButton></form>
          </Card>
          <Card title="Languages — catalogue translation">
            <p className="mb-3 text-sm text-brand-900/65">The Translator Agent keeps your service menu, description and deals in English + 12 Indian languages, so customers read your salon page in their own language. It runs automatically when you add or edit services; free providers only{trProviders.length ? <> (so far: <b>{trProviders.join(", ")}</b>)</> : null}.</p>
            {strings.length ? (
              <ul className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                {coverage.map((c) => (
                  <li key={c.l}>
                    <span className="flex justify-between"><span>{LANGUAGES[c.l] ?? c.l}</span><span className="text-brand-900/55">{c.have}/{c.need}</span></span>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-brand-100"><span className={`block h-full rounded-full ${c.have >= c.need ? "bg-emerald-500" : "bg-gold-400"}`} style={{ width: `${Math.round((c.have / c.need) * 100)}%` }} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="mb-3 text-xs text-brand-900/50">Add services first — there is nothing to translate yet.</p>}
            <form action={translateCatalogue}><SubmitButton variant="secondary" pendingText="Translating…">Translate now</SubmitButton></form>
          </Card>
          <Card title="Audit log (append-only)">
            {audit.error ? (
              <p className="text-xs text-brand-900/60">Not enabled yet — apply <code>supabase/migrations/0007_audit_log.sql</code> in the Supabase SQL editor to start recording every change to clients, staff, invoices and payroll.</p>
            ) : (audit.data ?? []).length ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                {(audit.data ?? []).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 border-b border-brand-50 py-1">
                    <span><Badge tone={e.actor_type === "agent" ? "violet" : e.actor_type === "user" ? "blue" : "slate"}>{e.actor_type}</Badge> {e.op} <b>{e.table_name}</b>{e.changed_fields?.length ? ` · ${e.changed_fields.slice(0, 4).join(", ")}${e.changed_fields.length > 4 ? "…" : ""}` : ""}</span>
                    <span className="shrink-0 text-brand-900/45">{fmtDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-brand-900/50">No changes recorded yet.</p>}
          </Card>
          <Card title="Security & compliance">
            <ul className="list-disc space-y-1 pl-4 text-xs text-brand-900/65">
              <li>Tenant isolation enforced in Postgres Row-Level Security on every table.</li>
              <li>Encryption: TLS in transit; AES-256 at rest (Supabase managed storage).</li>
              <li>DPDP: marketing consent per client, data export and right-to-erasure on the Clients page.</li>
              <li>AI agents only act through audited functions; every action is logged in the Agent Console.</li>
            </ul>
            <form action={deleteMyAccount} className="mt-3 flex items-end gap-2 border-t pt-3">
              <Field label="Delete my account and all salons I own (type DELETE)"><Input name="confirm" placeholder="DELETE" /></Field>
              <SubmitButton variant="danger">Delete</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
