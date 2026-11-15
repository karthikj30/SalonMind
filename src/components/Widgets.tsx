import { AlertTriangle, BadgePercent, Bot, CalendarCheck, CalendarClock, IndianRupee, Landmark, PackageOpen, ShoppingCart, TrendingUp, UserX, Users, BarChart3, type LucideIcon } from "lucide-react";
import { DATASETS, type DatasetKey, type DatasetValue, type Widget } from "@/lib/services/metrics";

const ICONS: Record<DatasetKey, LucideIcon> = {
  revenue_today: IndianRupee, revenue_30d: TrendingUp, bookings_today: CalendarCheck, no_show_rate: UserX, at_risk_clients: AlertTriangle,
  low_stock: PackageOpen, upcoming_bookings: CalendarClock, active_deals: BadgePercent, pending_pos: ShoppingCart, revenue_by_service: BarChart3,
  staff_revenue: Users, gst_month: Landmark, agent_actions: Bot,
};

/** Safe renderer for AI-generated micro-frontends: the LLM only chooses from a typed widget registry. */
export function WidgetGrid({ widgets, data }: { widgets: Widget[]; data: Record<string, DatasetValue> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {widgets.map((w, i) => {
        const d = data[w.dataset];
        const Icon = ICONS[w.dataset] ?? BarChart3;
        const span = w.span === 3 ? "lg:col-span-3 sm:col-span-2" : w.span === 2 ? "lg:col-span-2 sm:col-span-2" : "";
        if (d?.kind === "kpi") {
          return (
            <section key={i} className={`relative overflow-hidden rounded-2xl border border-brand-100/80 bg-white p-5 shadow-soft ${span}`}>
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-champagne opacity-70" aria-hidden />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-brand-900/50">{w.title || DATASETS[w.dataset]?.title}</h3>
                  <p className="mt-2 font-display text-3xl font-semibold text-brand-900">{d.value}</p>
                  {d.hint && <p className="mt-0.5 text-xs text-brand-900/50">{d.hint}</p>}
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-gold text-white shadow-soft"><Icon className="h-5 w-5" aria-hidden /></span>
              </div>
            </section>
          );
        }
        return (
          <section key={i} className={`rounded-2xl border border-brand-100/80 bg-white p-5 shadow-soft ${span}`}>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-900/50">
              <Icon className="h-4 w-4 text-gold-600" aria-hidden />{w.title || DATASETS[w.dataset]?.title}
            </h3>
            {!d ? <p className="text-sm text-brand-900/40">—</p> : d.kind === "list" ? (
              d.rows.length ? (
                <ul className="divide-y divide-brand-50 text-sm">
                  {d.rows.map((r, j) => <li key={j} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate text-brand-900">{r.label}</span>{r.value && <span className="shrink-0 text-xs text-brand-900/50">{r.value}</span>}</li>)}
                </ul>
              ) : <p className="py-4 text-center text-sm text-brand-900/40">Nothing yet.</p>
            ) : d.rows.length ? (
              <div className="space-y-2.5">
                {d.rows.map((r, j) => {
                  const max = Math.max(...d.rows.map((x) => x.value), 1);
                  return (
                    <div key={j} className="text-xs">
                      <div className="mb-1 flex justify-between"><span className="truncate text-brand-900">{r.label}</span><span className="text-brand-900/55">₹{Math.round(r.value).toLocaleString("en-IN")}</span></div>
                      <div className="h-2 rounded-full bg-brand-50"><div className="h-2 rounded-full bg-rose-gold" style={{ width: `${(r.value / max) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="py-4 text-center text-sm text-brand-900/40">No completed services yet.</p>}
          </section>
        );
      })}
    </div>
  );
}
