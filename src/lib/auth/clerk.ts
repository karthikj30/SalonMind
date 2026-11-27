/**
 * Clerk sign-in with a one-time email code (free on Clerk's Hobby plan; SMS codes need a paid plan).
 * Clerk proves the person owns the email address; Supabase stays the database identity, so RLS
 * (`auth.uid()`), tenants and every query are unchanged — see src/app/auth/clerk/route.ts.
 *
 * Switched on by setting both keys (Clerk Dashboard → API keys): NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
 * CLERK_SECRET_KEY. Until then the login and signup pages keep the email + password forms.
 */
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/** Usable on server and client (the publishable key is inlined at build time). */
export const clerkEnabled = CLERK_PUBLISHABLE_KEY.startsWith("pk_");

export function clerkServerEnabled(): boolean {
  return clerkEnabled && Boolean(process.env.CLERK_SECRET_KEY);
}
