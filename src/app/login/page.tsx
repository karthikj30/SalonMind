import Link from "next/link";
import { signIn } from "../auth-actions";
import { Field, Input, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto mt-20 max-w-sm px-4">
      <Link href="/" className="text-lg font-bold text-brand-700">✂️ SalonMind</Link>
      <h1 className="mb-4 mt-6 text-xl font-bold">Log in</h1>
      <Flash error={sp.error} msg={sp.msg} />
      <form action={signIn} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
        <SubmitButton className="w-full">Log in</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">New salon? <Link href="/signup" className="text-brand-600">Create an account</Link></p>
    </main>
  );
}
