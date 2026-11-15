import { createSalon } from "../auth-actions";
import { Field, Input, Select, Textarea, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell } from "@/components/AuthShell";
import { STATES } from "@/lib/states";

export const metadata = { title: "Set up your salon" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Set up your salon" subtitle="Each salon is an isolated workspace. You can add more branches later.">
      <Flash error={sp.error} />
      <form action={createSalon} className="grid gap-4 rounded-2xl border border-brand-100 bg-white p-6 shadow-soft sm:grid-cols-2">
        <Field label="Salon name" className="sm:col-span-2"><Input name="name" required placeholder="e.g. Glow Studio Bandra" /></Field>
        <Field label="City"><Input name="city" required placeholder="Mumbai" /></Field>
        <Field label="State (GST)">
          <Select name="state" required defaultValue="27|Maharashtra">
            {STATES.map(([c, n]) => <option key={c} value={`${c}|${n}`}>{c} · {n}</option>)}
          </Select>
        </Field>
        <Field label="GSTIN" hint="Optional — enables e-invoice reference"><Input name="gstin" placeholder="27ABCDE1234F1Z5" /></Field>
        <Field label="Phone"><Input name="phone" placeholder="+91…" /></Field>
        <Field label="Address" className="sm:col-span-2"><Input name="address" /></Field>
        <Field label="Short description (shown in marketplace)" className="sm:col-span-2"><Textarea name="description" placeholder="Balayage specialists, bridal makeup and men's grooming." /></Field>
        <div className="sm:col-span-2"><SubmitButton className="w-full !py-2.5">Create salon</SubmitButton></div>
      </form>
    </AuthShell>
  );
}
