"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { botClient } from "@/lib/supabase/bot";
import { TENANT_COOKIE } from "@/lib/tenant";

export async function signIn(fd: FormData) {
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/app");
}

export async function signUp(fd: FormData) {
  const email = String(fd.get("email")).trim().toLowerCase();
  const password = String(fd.get("password"));
  const name = String(fd.get("name") ?? "").trim();
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("Password must be at least 8 characters")}`);
  try {
    const bot = await botClient();
    const { error } = await bot.rpc("provision_user", { p_email: email, p_password: password, p_name: name });
    if (error) throw new Error(error.message);
  } catch (e) {
    redirect(`/signup?error=${encodeURIComponent((e as Error).message)}`);
  }
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/onboarding");
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect("/");
}

export async function switchSalon(fd: FormData) {
  (await cookies()).set(TENANT_COOKIE, String(fd.get("tenant_id")), { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/app");
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export async function createSalon(fd: FormData) {
  const db = await createClient();
  const name = String(fd.get("name")).trim();
  const [stateCode, stateName] = String(fd.get("state") || "|").split("|");
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await db.rpc("create_tenant", {
    p_name: name, p_slug: slug, p_city: String(fd.get("city") || ""), p_state: stateName, p_state_code: stateCode,
    p_gstin: String(fd.get("gstin") || "") || null, p_address: String(fd.get("address") || ""), p_phone: String(fd.get("phone") || ""),
    p_description: String(fd.get("description") || ""),
  });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  (await cookies()).set(TENANT_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/app?msg=" + encodeURIComponent("Salon created! Next: add staff, rooms and services."));
}
