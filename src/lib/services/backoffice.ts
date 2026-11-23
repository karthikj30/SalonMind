import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "../agents/types";
import { computePayroll } from "../agents/hr";
import { profitAndLoss } from "../domain/pnl";
import { todayIst } from "../time";

/** Clock a stylist in for today (one row per stylist per day). */
export async function clockIn(db: SupabaseClient, tenantId: string, staffId: string, source: "desk" | "voice" | "manual" = "desk") {
  const { error } = await db.from("staff_attendance").insert({ tenant_id: tenantId, staff_id: staffId, work_date: todayIst(), clock_in: new Date().toISOString(), source });
  if (error?.code === "23505") throw new Error("Already clocked in today");
  if (error) throw new Error(error.message);
}

export async function clockOut(db: SupabaseClient, tenantId: string, staffId: string) {
  const { data, error } = await db.from("staff_attendance").update({ clock_out: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("staff_id", staffId).eq("work_date", todayIst()).is("clock_out", null).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not clocked in today (or already clocked out)");
}

/** Month-to-date profit & loss (month = YYYY-MM). Numbers come from invoices, stock at cost, payroll and expenses. */
export async function monthlyPnl(db: SupabaseClient, tenant: Tenant, month: string) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const to = last < todayIst() ? last : todayIst();
  const [{ data: invoices }, { data: usage }, { data: expenses }, { data: products }] = await Promise.all([
    db.from("invoices").select("taxable_value, items").eq("tenant_id", tenant.id).gte("invoice_date", from).lte("invoice_date", to),
    db.from("usage_logs").select("product_id, actual_qty").eq("tenant_id", tenant.id).gte("created_at", `${from}T00:00:00+05:30`).lte("created_at", `${to}T23:59:59+05:30`),
    db.from("expenses").select("category, amount").eq("tenant_id", tenant.id).gte("spent_on", from).lte("spent_on", to),
    db.from("products").select("id, unit_cost").eq("tenant_id", tenant.id),
  ]);
  const cost = new Map((products ?? []).map((p) => [p.id as string, Number(p.unit_cost)]));
  type Item = { kind: string; taxable_value: number; qty?: number; product_id?: string | null };
  const retailCost = (invoices ?? []).flatMap((i) => (i.items ?? []) as Item[]).filter((it) => it.kind === "product" && it.product_id)
    .reduce((s, it) => s + (cost.get(it.product_id!) ?? 0) * Number(it.qty ?? 1), 0);
  const backBarCost = (usage ?? []).reduce((s, u) => s + (cost.get(u.product_id) ?? 0) * Number(u.actual_qty ?? 0), 0);
  const payroll = await computePayroll(db, tenant.id, from, to);
  return {
    from, to,
    ...profitAndLoss({ invoices: (invoices ?? []) as never, productCost: retailCost + backBarCost, payroll: payroll.employer_cost, expenses: (expenses ?? []) as never }),
  };
}
