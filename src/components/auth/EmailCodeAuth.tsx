"use client";
import { ClerkProvider, useClerk } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/auth/clerk";

type Mode = "login" | "signup";

/** Clerk's email one-time code for log in and sign up. Clerk is loaded on these two pages only. */
export function EmailCodeAuth({ mode }: { mode: Mode }) {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl={mode === "signup" ? "/signup" : "/login"}>
      <EmailCodeForm mode={mode} />
    </ClerkProvider>
  );
}

/** Sign-up needs no password from the person: a random one satisfies a Clerk app that still has passwords on. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x")}Aa1!`;
}

function messageOf(e: unknown): string {
  if (isClerkAPIResponseError(e)) return e.errors[0]?.longMessage ?? e.errors[0]?.message ?? "Something went wrong.";
  return (e as Error)?.message || "Something went wrong.";
}

const hasCode = (e: unknown, ...codes: string[]) => isClerkAPIResponseError(e) && e.errors.some((x) => codes.includes(x.code));

function EmailCodeForm({ mode }: { mode: Mode }) {
  const clerk = useClerk();
  const { isLoaded: signInReady, signIn, setActive } = useSignIn();
  const { isLoaded: signUpReady, signUp } = useSignUp();
  const [step, setStep] = useState<"email" | "code" | "opening">("email");
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const ready = signInReady && signUpReady && !!signIn && !!signUp && !!setActive;

  // Every log in starts fresh: a Clerk session left in this browser never opens a salon by itself
  useEffect(() => {
    if (clerk.loaded && clerk.session) void clerk.signOut(() => undefined);
  }, [clerk, clerk.loaded]);

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
      try {
        const attempt = await signIn.create({ identifier: address });
        const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === "email_code");
        if (!factor || !("emailAddressId" in factor)) throw new Error("Email codes are switched off for log in. Turn on \"Email verification code\" in the Clerk dashboard.");
        await attempt.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
        setFlow("signIn");
      } catch (err) {
        if (!hasCode(err, "form_identifier_not_found")) throw err;
        // A new email: register it, with the same code step
        try {
          await signUp.create({ emailAddress: address, password: randomPassword() });
        } catch (err2) {
          if (!hasCode(err2, "form_param_unknown", "form_param_not_allowed")) throw err2;
          await signUp.create({ emailAddress: address });
        }
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
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
      let sessionId: string | null = null;
      if (flow === "signIn") {
        const res = await signIn.attemptFirstFactor({ strategy: "email_code", code: code.trim() });
        if (res.status !== "complete") throw new Error("This account needs another sign-in step that SalonMind does not support. Turn it off in the Clerk dashboard.");
        sessionId = res.createdSessionId;
      } else {
        const res = await signUp.attemptEmailAddressVerification({ code: code.trim() });
        if (res.status !== "complete") throw new Error(`Clerk also asks for: ${res.missingFields.join(", ")}. Turn those off in the Clerk dashboard (User & authentication).`);
        sessionId = res.createdSessionId;
      }
      await setActive({ session: sessionId });
      setStep("opening");
      const token = await clerk.session?.getToken();
      const res = await fetch("/auth/clerk", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
      // The salon app runs on its own session from here; the Clerk one is no longer needed
      await clerk.signOut(() => undefined).catch(() => undefined);
      if (!res.ok) throw new Error(j.error ?? "Could not open your account. Try again.");
      window.location.assign(j.next ?? "/app");
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
    </div>
  );
}
