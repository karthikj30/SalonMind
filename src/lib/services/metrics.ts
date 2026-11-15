import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fmtDateTime, inr, istDate, todayIst } from "../time";

/** Dataset registry used by the dashboard and by AI-generated micro-frontends (Studio). */
export const DATASETS = {
  revenue_today: { kind: "kpi", title: "Revenue today" },
  revenue_30d: { kind: "kpi", title: "Revenue (30 days)" },
  bookings_today: { kind: "kpi", title: "Bookings today" },
  no_show_rate: { kind: "kpi", title: "No-show rate (30d)" },
  at_risk_clients: { kind: "list", title: "Clients at risk of churn" },
  low_stock: { kind: "list", title: "Low stock" },
  upcoming_bookings: { kind: "list", title: "Upcoming bookings" },
  active_deals: { kind: "list", title: "Live marketplace deals" },
  pending_pos: { kind: "list", title: "Purchase orders awaiting approval" },
  revenue_by_service: { kind: "bar", title: "Revenue by service (30d)" },
  staff_revenue: { kind: "bar", title: "Revenue by stylist (30d)" },
  gst_month: { kind: "kpi", title: "GST collected this month" },
  agent_actions: { kind: "list", title: "Latest agent actions" },
} as const;
export type DatasetKey = keyof typeof DATASETS;

export type Widget = { dataset: DatasetKey; title?: string; span?: 1 | 2 | 3 };
export type DatasetValue = { kind: "kpi"; value: string; hint?: string } | { kind: "list"; rows: { label: string; value?: string }[] } | { kind: "bar"; rows: { label: string; value: number }[] };

export async function computeDatasets(db: SupabaseClient, tenantId: string, keys: DatasetKey[]): Promise<Record<string, DatasetValue>> {
  const today = todayIst();
  const t0 = istDate(today, "00:00").toISOString(), t1 = istDate(today, "23:59").toISOString();
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const out: Record<string, DatasetValue> = {};
  const need = new Set(keys);
  const b30 = need.has("revenue_30d") || need.has("no_show_rate") || need.has("revenue_by_service") || need.has("staff_revenue")
    ? (await db.from("bookings").select("price, status, services(name), staff(name)").eq("tenant_id", tenantId).gte("start_at", d30).lte("start_at", new Date().toISOString())).data ?? [] : [];
  for (const k of keys) {
    if (k === "revenue_today") {
      const { data } = await db.from("invoices").select("total").eq("tenant_id", tenantId).eq("invoice_date", today);
      out[k] = { kind: "kpi", value: inr((data ?? []).reduce((s, i) => s + Number(i.total), 0)), hint: `${data?.length ?? 0} invoices` };
    } else if (k === "revenue_30d") {
      const done = b30.filter((b) => b.status === "completed");
      out[k] = { kind: "kpi", value: inr(done.reduce((s, b) => s + Number(b.price), 0)), hint: `${done.length} services (pre-tax)` };
    } else if (k === "bookings_today") {
      const { data } = await db.from("bookings").select("status").eq("tenant_id", tenantId).gte("start_at", t0).lte("start_at", t1).neq("status", "cancelled");
      out[k] = { kind: "kpi", value: String(data?.length ?? 0), hint: `${(data ?? []).filter((b) => b.status === "completed").length} completed` };
    } else if (k === "no_show_rate") {
      const fin = b30.filter((b) => ["completed", "no_show"].includes(b.status));
      const ns = fin.filter((b) => b.status === "no_show").length;
      out[k] = { kind: "kpi", value: fin.length ? `${Math.round((ns / fin.length) * 100)}%` : "—", hint: `${ns} of ${fin.length}` };
    } else if (k === "at_risk_clients") {
      const { data } = await db.from("clients").select("name, churn_risk").eq("tenant_id", tenantId).gte("churn_risk", 0.5).order("churn_risk", { ascending: false }).limit(6);
      out[k] = { kind: "list", rows: (data ?? []).map((c) => ({ label: c.name, value: `${Math.round(c.churn_risk * 100)}%` })) };
    } else if (k === "low_stock") {
      const { data } = await db.from("products").select("name, stock_qty, reorder_level, unit").eq("tenant_id", tenantId);
      out[k] = { kind: "list", rows: (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.reorder_level) * 1.2).map((p) => ({ label: p.name, value: `${p.stock_qty} ${p.unit}` })) };
    } else if (k === "upcoming_bookings") {
      const { data } = await db.from("bookings").select("start_at, clients(name), services(name), staff(name)").eq("tenant_id", tenantId).in("status", ["booked", "confirmed"]).gte("start_at", new Date().toISOString()).order("start_at").limit(6);
      out[k] = { kind: "list", rows: (data ?? []).map((b: any) => ({ label: `${b.clients?.name ?? "Guest"} · ${b.services?.name ?? ""}`, value: `${fmtDateTime(b.start_at)} · ${b.staff?.name ?? ""}` })) };
    } else if (k === "active_deals") {
      const { data } = await db.from("deals").select("title, discount_pct, valid_to").eq("tenant_id", tenantId).eq("active", true).gte("valid_to", new Date().toISOString()).limit(6);
      out[k] = { kind: "list", rows: (data ?? []).map((d) => ({ label: d.title, value: `until ${fmtDateTime(d.valid_to)}` })) };
    } else if (k === "pending_pos") {
      const { data } = await db.from("purchase_orders").select("total, vendors(name), created_at").eq("tenant_id", tenantId).eq("status", "draft").limit(6);
      out[k] = { kind: "list", rows: (data ?? []).map((p: any) => ({ label: p.vendors?.name ?? "No vendor", value: inr(p.total) })) };
    } else if (k === "revenue_by_service" || k === "staff_revenue") {
      const m = new Map<string, number>();
      b30.filter((b) => b.status === "completed").forEach((b: any) => {
        const key = (k === "revenue_by_service" ? b.services?.name : b.staff?.name) ?? "—";
        m.set(key, (m.get(key) ?? 0) + Number(b.price));
      });
      out[k] = { kind: "bar", rows: [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8) };
    } else if (k === "gst_month") {
      const { data } = await db.from("invoices").select("cgst, sgst, igst").eq("tenant_id", tenantId).gte("invoice_date", today.slice(0, 8) + "01");
      out[k] = { kind: "kpi", value: inr((data ?? []).reduce((s, i) => s + Number(i.cgst) + Number(i.sgst) + Number(i.igst), 0)), hint: "CGST+SGST+IGST" };
    } else if (k === "agent_actions") {
      const { data } = await db.from("agent_runs").select("agent, summary, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(6);
      out[k] = { kind: "list", rows: (data ?? []).map((r) => ({ label: `${r.agent}: ${r.summary}`, value: fmtDateTime(r.created_at) })) };
    }
  }
  return out;
}

export const DEFAULT_LAYOUT: Widget[] = [
  { dataset: "revenue_today" }, { dataset: "bookings_today" }, { dataset: "revenue_30d" },
  { dataset: "upcoming_bookings", span: 2 }, { dataset: "no_show_rate" },
  { dataset: "agent_actions", span: 2 }, { dataset: "low_stock" },
  { dataset: "revenue_by_service", span: 2 }, { dataset: "at_risk_clients" },
];
export { addDays };
