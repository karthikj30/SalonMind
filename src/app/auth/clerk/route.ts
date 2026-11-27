import { createHmac } from "node:crypto";
import { createClerkClient, verifyToken } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkServerEnabled } from "@/lib/auth/clerk";
import { botClient } from "@/lib/supabase/bot";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Called by the login / signup page right after Clerk has verified the one-time email code.
 * Checks the Clerk session token, takes the account's verified email, makes sure a Supabase user exists
 * for it (an existing owner keeps their salons) and opens the usual Supabase session in cookies.
 *
 * The Supabase password is derived from Clerk's secret key and the Clerk user id, so it exists nowhere and
 * nobody types it; `clerk_bridge_user` refuses the agent service account.
 */
export async function POST(req: Request) {
  if (!clerkServerEnabled()) return NextResponse.json({ error: "Email codes are not switched on." }, { status: 404 });
  const secretKey = process.env.CLERK_SECRET_KEY!;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in with your email code first." }, { status: 401 });

  let userId: string;
  try {
    userId = (await verifyToken(token, { secretKey })).sub;
  } catch {
    return NextResponse.json({ error: "Your sign-in expired. Ask for a new code." }, { status: 401 });
  }
  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return NextResponse.json({ error: "Verify your email with the code first." }, { status: 403 });
  const email = primary.emailAddress.toLowerCase();

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const typed = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const name = typed || [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email.split("@")[0];
  const password = createHmac("sha256", secretKey).update(`salonmind-clerk:${user.id}:${email}`).digest("base64url");

  try {
    const bot = await botClient();
    const { error } = await bot.rpc("clerk_bridge_user", { p_email: email, p_password: password, p_name: name });
    if (error) throw new Error(error.message);
  } catch (e) {
    const msg = (e as Error).message;
    const status = /not allowed/.test(msg) ? 403 : 500;
    if (status === 500) console.error("clerk bridge failed", msg);
    return NextResponse.json({ error: status === 403 ? "This email cannot sign in here." : "Could not open your account. Try again." }, { status });
  }

  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("supabase sign-in after clerk failed", error.message);
    return NextResponse.json({ error: "Could not open your account. Try again." }, { status: 500 });
  }
  // Owners without a salon are sent on to onboarding by /app itself
  return NextResponse.json({ next: "/app" });
}
