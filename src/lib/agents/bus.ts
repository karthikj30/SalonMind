import type { SupabaseClient } from "@supabase/supabase-js";

/** Publish an event onto the tenant's agent bus (agent_events table). */
export async function emit(db: SupabaseClient, tenantId: string, type: string, payload: Record<string, unknown>, source = "system") {
  const { error } = await db.from("agent_events").insert({ tenant_id: tenantId, type, payload, source });
  if (error) console.error("[emit]", error.message);
}
