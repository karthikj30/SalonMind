import Link from "next/link";
import { signUp } from "../auth-actions";
import { Field, Input, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function Signup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto mt-20 max-w-sm px-4">
      <Link href="/" className="text-lg font-bold text-brand-700">✂️ SalonMind</Link>
      <h1 className="mb-4 mt-6 text-xl font-bold">Create your account</h1>
      <Flash error={sp.error} />
      <form action={signUp} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <Field label="Your name"><Input name="name" required /></Field>
        <Field label="Email"><Input name="email" type="email" required /></Field>
        <Field label="Password" hint="At least 8 characters"><Input name="password" type="password" minLength={8} required /></Field>
        <SubmitButton className="w-full">Sign up</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="text-brand-600">Log in</Link></p>
    </main>
  );
}
