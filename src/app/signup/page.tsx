import Link from "next/link";
import { signUp } from "../auth-actions";
import { Field, Input, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell } from "@/components/AuthShell";
import { EmailCodeAuth } from "@/components/auth/EmailCodeAuth";
import { clerkEnabled } from "@/lib/auth/clerk";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Create your account" subtitle="Free forever on the starter tier. Set up takes about 5 minutes.">
      <Flash error={sp.error} />
      {clerkEnabled ? (
        <EmailCodeAuth mode="signup" />
      ) : (
        <form action={signUp} className="space-y-4 rounded-2xl border border-brand-100 bg-surface p-6 shadow-soft">
          <Field label="Your name"><Input name="name" required autoComplete="name" /></Field>
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password" hint="At least 8 characters"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
          <SubmitButton className="w-full !py-2.5">Sign up</SubmitButton>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-brand-900/60">Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Log in</Link></p>
    </AuthShell>
  );
}
