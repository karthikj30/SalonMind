import type { useClerk } from "@clerk/nextjs";

type Clerk = ReturnType<typeof useClerk>;

/**
 * After any Clerk sign-in (password, Google / Apple / Microsoft, or the email code): ask the server to open
 * the matching SalonMind session (src/app/auth/clerk/route.ts), then end the Clerk session — the salon app
 * runs on its own session, and a Clerk session left in the browser could otherwise open the salon again.
 * Returns where to go next.
 */
export async function openSalon(clerk: Clerk, name = ""): Promise<string> {
  const token = await clerk.session?.getToken();
  const res = await fetch("/auth/clerk", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify({ name: name.trim() }),
  });
  const j = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
  await clerk.signOut(() => undefined).catch(() => undefined);
  if (!res.ok) throw new Error(j.error ?? "Could not open your account. Try again.");
  return j.next ?? "/app";
}
