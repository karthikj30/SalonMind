import Link from "next/link";
import { signIn } from "../auth-actions";
import { Field, Input, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell } from "@/components/AuthShell";
import { ClerkAuth } from "@/components/auth/ClerkAuth";
import { getDict } from "@/lib/i18n/server";
import { clerkEnabled } from "@/lib/auth/clerk";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { lang } = await getDict();
  return (
    <AuthShell title="Welcome back" subtitle="Log in to your salon's command centre.">
      <Flash error={sp.error} msg={sp.msg} />
      {clerkEnabled ? (
        <ClerkAuth mode="login" lang={lang} />
      ) : (
        <form action={signIn} className="space-y-4 rounded-2xl border border-brand-100 bg-surface p-6 shadow-soft">
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
          <SubmitButton className="w-full !py-2.5">Log in</SubmitButton>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-brand-900/60">New salon? <Link href="/signup" className="font-medium text-brand-600 hover:underline">Create an account</Link></p>
    </AuthShell>
  );
}
