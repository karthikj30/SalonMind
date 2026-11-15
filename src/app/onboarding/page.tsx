import { createSalon } from "../auth-actions";
import { Field, Input, Select, Textarea, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { STATES } from "@/lib/states";

export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto mt-12 max-w-xl px-4 pb-12">
      <h1 className="text-xl font-bold">Set up your salon</h1>
      <p className="mb-4 text-sm text-slate-500">Each salon is an isolated tenant. You can add more salons (branches) later.</p>
      <Flash error={sp.error} />
      <form action={createSalon} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
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
        <Field label="Short description (shown in marketplace)" className="sm:col-span-2"><Textarea name="description" /></Field>
        <div className="sm:col-span-2"><SubmitButton>Create salon</SubmitButton></div>
      </form>
    </main>
  );
}
