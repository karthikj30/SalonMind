import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { normalizeTenant } from "./agents/runtime";
import type { Tenant } from "./agents/types";

export const TENANT_COOKIE = "sm_tenant";

/** Resolve the signed-in user + their active salon (tenant). Redirects to login / onboarding as needed. */
export async function getTenantContext() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await db.from("tenant_members").select("tenant_id, role, tenants(id, name, slug)").eq("user_id", user.id);
  if (!memberships?.length) redirect("/onboarding");
  const store = await cookies();
  const wanted = store.get(TENANT_COOKIE)?.value;
  const m = memberships.find((x) => x.tenant_id === wanted) ?? memberships[0];
  const { data: tenant } = await db.from("tenants").select("*").eq("id", m.tenant_id).single();
  if (!tenant) redirect("/onboarding");
  return {
    db, user, role: m.role as string, tenant: normalizeTenant(tenant as Tenant),
    salons: memberships.map((x) => ({ id: x.tenant_id, name: (x.tenants as unknown as { name: string })?.name })),
  };
}
