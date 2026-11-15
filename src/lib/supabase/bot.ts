import "server-only";
import { createClient as createSb, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./server";

/**
 * The agent mesh runs as a dedicated "platform agent" service account. RLS grants it
 * cross-tenant access (see public.is_platform_agent()). This lets cron / marketplace /
 * signup work on the free tier without exposing a service-role key.
 */
let cached: { client: SupabaseClient; expiresAt: number } | null = null;

export async function botClient(): Promise<SupabaseClient> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.client;
  const email = process.env.AGENT_BOT_EMAIL;
  const password = process.env.AGENT_BOT_PASSWORD;
  if (!email || !password) throw new Error("AGENT_BOT_EMAIL / AGENT_BOT_PASSWORD not configured");
  const client = createSb(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error("Agent service account sign-in failed: " + error?.message);
  cached = { client, expiresAt: (data.session.expires_at ?? 0) * 1000 };
  return client;
}
