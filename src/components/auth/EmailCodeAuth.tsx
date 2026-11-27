"use client";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";
import { openSalon } from "@/lib/auth/open-salon";

type Mode = "login" | "signup";

/** Sign-up needs no password from the person: a random one satisfies a Clerk app that still has passwords on. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x")}Aa1!`;
}

function messageOf(e: unknown): string {
  if (isClerkAPIResponseError(e)) return e.errors[0]?.longMessage ?? e.errors[0]?.message ?? "Something went wrong.";
  return (e as { longMessage?: string })?.longMessage || (e as Error)?.message || "Something went wrong.";
}

/** Clerk error codes, from an API error (several) or a plain Clerk error (one). */
const codesOf = (e: unknown): string[] => (isClerkAPIResponseError(e) ? e.errors.map((x) => x.code) : typeof (e as { code?: unknown })?.code === "string" ? [(e as { code: string }).code] : []);

/** The 6-digit email code for log in and sign up (inside ClerkAuth's provider): a new email registers, a known one logs in. */
export function EmailCodeForm({ mode, onBack }: { mode: Mode; onBack: () => void }) {
  const clerk = useClerk();
  // Clerk's current custom-flow API: its calls also run Clerk's bot check (Protect) in a modal when needed
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<"email" | "code" | "opening">("email");
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const ready = clerk.loaded;

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const address = email.trim().toLowerCase();
    try {
      const sent = await signIn.emailCode.sendCode({ emailAddress: address });
      if (!sent.error) setFlow("signIn");
      else {
        if (!codesOf(sent.error).includes("form_identifier_not_found")) throw sent.error;
        // A new email: register it, with the same code step
        let created = await signUp.create({ emailAddress: address, password: randomPassword() });
        if (created.error && codesOf(created.error).some((c) => c === "form_param_unknown" || c === "form_param_not_allowed")) created = await signUp.create({ emailAddress: address });
        if (created.error) throw created.error;
        const mailed = await signUp.verifications.sendEmailCode();
        if (mailed.error) throw mailed.error;
        setFlow("signUp");
      }
      setCode("");
      setStep("code");
      setInfo(`We sent a 6-digit code to ${address}.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (flow === "signIn") {
        const checked = await signIn.emailCode.verifyCode({ code: code.trim() });
        if (checked.error) throw checked.error;
        if (signIn.status !== "complete") throw new Error("This account needs another sign-in step that SalonMind does not support. Turn it off in the Clerk dashboard.");
        const done = await signIn.finalize();
        if (done.error) throw done.error;
      } else {
        const checked = await signUp.verifications.verifyEmailCode({ code: code.trim() });
        if (checked.error) throw checked.error;
        if (signUp.status !== "complete") throw new Error(`Clerk also asks for: ${signUp.missingFields.join(", ")}. Turn those off in the Clerk dashboard (User & authentication).`);
        const done = await signUp.finalize();
        if (done.error) throw done.error;
      }
      setStep("opening");
      window.location.assign(await openSalon(clerk, name));
    } catch (err) {
      setStep("code");
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-brand-100 bg-surface p-6 shadow-soft">
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          {mode === "signup" && (
            <Field label="Your name"><Input name="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>
          )}
          <Field label="Email" hint="We email you a 6-digit code. No password needed.">
            <Input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
          </Field>
          <button type="submit" disabled={busy || !ready} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-gold px-3.5 py-2.5 text-sm font-medium text-white shadow-soft transition hover:shadow-lift hover:brightness-110 active:scale-[.97] disabled:cursor-wait disabled:opacity-70">
            {busy || !ready ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            {mode === "signup" ? "Email me a sign-up code" : "Email me a log-in code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <Field label="6-digit code">
            <input
              ref={codeInput}
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              className="w-full rounded-xl border border-brand-200 bg-surface px-3 py-2.5 text-center font-mono text-2xl tracking-[0.5em] text-brand-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            />
          </Field>
          <button type="submit" disabled={busy || code.length !== 6} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-gold px-3.5 py-2.5 text-sm font-medium text-white shadow-soft transition hover:shadow-lift hover:brightness-110 active:scale-[.97] disabled:cursor-wait disabled:opacity-70">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {step === "opening" ? "Opening your salon…" : "Verify and continue"}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" className="text-brand-600 hover:underline" disabled={busy} onClick={() => sendCode()}>Send a new code</button>
            <button type="button" className="text-brand-900/60 hover:underline" disabled={busy} onClick={() => (setStep("email"), setError(null), setInfo(null))}>Use another email</button>
          </div>
        </form>
      )}
      {info && !error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800" role="status">{info}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}
      {/* Clerk's bot check renders here when it needs to */}
      <div id="clerk-captcha" />
      <p className="border-t border-brand-100 pt-3 text-center text-xs">
        <button type="button" className="font-medium text-brand-900/60 hover:text-brand-900" disabled={busy} onClick={onBack}>Back to the usual sign-in window</button>
      </p>
    </div>
  );
}
