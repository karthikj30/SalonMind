import { DATASETS, type DatasetValue, type Widget } from "@/lib/services/metrics";

/** Safe renderer for AI-generated micro-frontends: the LLM only chooses from a typed widget registry. */
export function WidgetGrid({ widgets, data }: { widgets: Widget[]; data: Record<string, DatasetValue> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {widgets.map((w, i) => {
        const d = data[w.dataset];
        const span = w.span === 3 ? "lg:col-span-3 sm:col-span-2" : w.span === 2 ? "lg:col-span-2 sm:col-span-2" : "";
        return (
          <section key={i} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${span}`}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{w.title || DATASETS[w.dataset]?.title}</h3>
            {!d ? <p className="text-sm text-slate-400">—</p> : d.kind === "kpi" ? (
              <div><p className="text-2xl font-bold text-slate-900">{d.value}</p>{d.hint && <p className="text-xs text-slate-500">{d.hint}</p>}</div>
            ) : d.kind === "list" ? (
              d.rows.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.rows.map((r, j) => <li key={j} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{r.label}</span>{r.value && <span className="shrink-0 text-xs text-slate-500">{r.value}</span>}</li>)}
                </ul>
              ) : <p className="text-sm text-slate-400">Nothing yet.</p>
            ) : d.rows.length ? (
              <div className="space-y-1.5">
                {d.rows.map((r, j) => {
                  const max = Math.max(...d.rows.map((x) => x.value), 1);
                  return (
                    <div key={j} className="text-xs">
                      <div className="flex justify-between"><span className="truncate">{r.label}</span><span className="text-slate-500">₹{Math.round(r.value).toLocaleString("en-IN")}</span></div>
                      <div className="mt-0.5 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-400">No completed services yet.</p>}
          </section>
        );
      })}
    </div>
  );
}
