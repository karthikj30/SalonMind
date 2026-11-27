"use client";
import { bnIN, hiIN, taIN, teIN } from "@clerk/localizations";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/nextjs";
import { Loader2, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/auth/clerk";
import { openSalon } from "@/lib/auth/open-salon";
import { EmailCodeForm } from "./EmailCodeAuth";

type Mode = "login" | "signup";

/** Clerk's own translations exist for these SalonMind languages; the others see Clerk in English. */
const LOCALES = { hi: hiIN, bn: bnIN, ta: taIN, te: teIN } as const;

/** Clerk on the log-in, sign-up and continue pages only, in SalonMind's plum. */
function Clerk({ lang, children }: { lang: string; children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      localization={LOCALES[lang as keyof typeof LOCALES]}
      appearance={{ variables: { colorPrimary: "#7e3f75", borderRadius: "0.75rem" } }}
      signInUrl="/login"
      signUpUrl="/signup"
    >
      {children}
    </ClerkProvider>
  );
}

/**
 * Log in / sign up: Clerk's own window (email + password, Google, Apple, Microsoft) by default, with
 * "Get a one-time code by email instead" for the 6-digit email code. Every way ends on /auth/continue,
 * which opens the salon.
 */
export function ClerkAuth({ mode, lang }: { mode: Mode; lang: string }) {
  return (
    <Clerk lang={lang}>
      <Chooser mode={mode} />
    </Clerk>
  );
}

function Chooser({ mode }: { mode: Mode }) {
  const clerk = useClerk();
  const [useCode, setUseCode] = useState(false);
  const [ready, setReady] = useState(false);

  // A Clerk session left in this browser never opens a salon by itself; a Clerk step under way
  // (a Google return, a password reset, both use the #/… address) is left to finish.
  useEffect(() => {
    if (!clerk.loaded) return;
    const midFlow = /^#\/./.test(window.location.hash);
    if (clerk.session && !midFlow) void clerk.signOut(() => undefined).finally(() => setReady(true));
    else setReady(true);
  }, [clerk, clerk.loaded]);

  if (useCode) return <EmailCodeForm mode={mode} onBack={() => setUseCode(false)} />;
  // The pages carry their own "Create an account" / "Log in" links
  const appearance = { elements: { rootBox: "w-full", cardBox: "w-full shadow-soft", footerAction: { display: "none" } } };
  return (
    <div>
      {!ready ? (
        <div className="grid h-80 place-items-center rounded-2xl border border-brand-100 bg-surface" aria-busy="true">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden />
        </div>
      ) : mode === "signup" ? (
        <SignUp routing="hash" forceRedirectUrl="/auth/continue" signInForceRedirectUrl="/auth/continue" appearance={appearance} />
      ) : (
        <SignIn routing="hash" forceRedirectUrl="/auth/continue" signUpForceRedirectUrl="/auth/continue" appearance={appearance} />
      )}
      <p className="mt-3 text-center">
        <button type="button" onClick={() => setUseCode(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
          <Mail className="h-4 w-4" aria-hidden /> Get a one-time code by email instead
        </button>
      </p>
    </div>
  );
}

/** /auth/continue: Clerk has signed the person in (any way) — open their salon. */
export function ClerkContinue({ lang }: { lang: string }) {
  return (
    <Clerk lang={lang}>
      <Continue />
    </Clerk>
  );
}

function Continue() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!isLoaded || started.current) return;
    if (isSignedIn) {
      started.current = true;
      openSalon(clerk)
        .then((next) => window.location.assign(next))
        .catch((e: Error) => setError(e.message));
      return;
    }
    // Right after Clerk's window finishes, the new session can take a moment to show here
    const id = window.setTimeout(() => {
      if (!started.current) window.location.replace("/login");
    }, 4000);
    return () => window.clearTimeout(id);
  }, [clerk, isLoaded, isSignedIn]);
  return error ? (
    <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
      <p>{error}</p>
      <a href="/login" className="font-medium text-brand-700 underline">Back to log in</a>
    </div>
  ) : (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-surface p-5 text-sm text-brand-900/70" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden /> Opening your salon…
    </div>
  );
}
