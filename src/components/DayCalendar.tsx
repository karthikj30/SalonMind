import { Ban, Check } from "lucide-react";
import { category, monogram } from "@/lib/ui/categories";
import { minToTime, timeToMin, toIst } from "@/lib/time";

type CalBooking = {
  id: string; start_at: string; end_at: string; status: string; staff_id: string | null; price?: number | null;
  services?: { name: string; category?: string } | null; clients?: { name: string } | null; no_show_risk?: number | null;
};
type CalStaff = { id: string; name: string; skill_level?: number; work_start?: string; work_end?: string };
type CalLeave = { staff_id: string; start_at: string; end_at: string; reason?: string | null };


/** Visual day schedule: one column per stylist, blocks coloured by service category. */
export function DayCalendar({ date, open, close, staff, bookings, timeOff = [], isToday = false, compact = false }: {
  date: string; open: string; close: string; staff: CalStaff[]; bookings: CalBooking[]; timeOff?: CalLeave[]; isToday?: boolean; compact?: boolean;
}) {
  const PX = compact ? 0.8 : 1.15; // pixels per minute
  const o = timeToMin(open.slice(0, 5)), c = timeToMin(close.slice(0, 5));
  const height = (c - o) * PX;
  const hours: number[] = [];
  for (let m = Math.ceil(o / 60) * 60; m <= c; m += 60) hours.push(m);
  const now = toIst(new Date());
  const nowMin = isToday && now.date === date && now.minutes >= o && now.minutes <= c ? now.minutes : null;
  const live = bookings.filter((b) => b.status !== "cancelled");
  const unassigned = live.filter((b) => !b.staff_id || !staff.some((s) => s.id === b.staff_id));
  const cols = [...staff, ...(unassigned.length ? [{ id: "__none", name: "Unassigned" }] : [])];

  if (!cols.length) return <p className="py-8 text-center text-sm text-brand-900/50">Add stylists to see the day calendar.</p>;

  const block = (b: CalBooking) => {
    const s = toIst(new Date(b.start_at)), e = toIst(new Date(b.end_at));
    const top = (Math.max(s.minutes, o) - o) * PX, h = Math.max(22, (Math.min(e.minutes, c) - Math.max(s.minutes, o)) * PX - 2);
    const cat = category(b.services?.category);
    const Icon = cat.icon;
    const risky = (b.no_show_risk ?? 0) >= 0.55 && ["booked", "confirmed"].includes(b.status);
    return (
      <a key={b.id} href={`#b-${b.id}`} title={`${s.time}–${e.time} · ${b.services?.name ?? ""} · ${b.clients?.name ?? ""} (${b.status})`}
        style={{ top, height: h }}
        className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-lift ${cat.block} ${b.status === "no_show" ? "opacity-60 line-through" : ""} ${b.status === "completed" ? "opacity-75" : ""}`}>
        <div className="flex items-center gap-1 font-semibold">
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{b.clients?.name ?? "Guest"}</span>
          {b.status === "completed" && <Check className="ml-auto h-3 w-3 shrink-0" aria-label="completed" />}
          {risky && <span className="ml-auto rounded bg-red-500 px-1 text-[9px] font-bold text-white" title="High no-show risk">!</span>}
        </div>
        {h > 30 && <div className="truncate opacity-80">{b.services?.name}</div>}
        {h > 46 && <div className="opacity-60">{s.time}–{e.time}</div>}
      </a>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-brand-100 bg-ivory-50">
      <div className="flex" style={{ minWidth: 64 + cols.length * (compact ? 130 : 160) }}>
        {/* time gutter */}
        <div className="w-16 shrink-0 border-r border-brand-100">
          <div className="h-12 border-b border-brand-100" />
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-brand-900/45" style={{ top: (m - o) * PX }}>
                {Number(minToTime(m).slice(0, 2)) % 12 || 12}{m < 720 ? "am" : "pm"}
              </span>
            ))}
          </div>
        </div>
        {cols.map((st) => {
          const mg = monogram(st.name);
          const mine = st.id === "__none" ? unassigned : live.filter((b) => b.staff_id === st.id);
          const leave = timeOff.filter((t) => t.staff_id === st.id);
          const ws = "work_start" in st && st.work_start ? timeToMin(st.work_start.slice(0, 5)) : o;
          const we = "work_end" in st && st.work_end ? timeToMin(st.work_end.slice(0, 5)) : c;
          return (
            <div key={st.id} className="min-w-0 flex-1 border-r border-brand-100 last:border-r-0">
              <div className="flex h-12 items-center gap-2 border-b border-brand-100 bg-white px-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ${mg.gradient}`}>{mg.initials}</span>
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-brand-900">{st.name}</p><p className="text-[10px] text-brand-900/45">{mine.length} appt{mine.length === 1 ? "" : "s"}</p></div>
              </div>
              <div className="relative" style={{ height }}>
                {hours.map((m) => <div key={m} className="absolute inset-x-0 border-t border-dashed border-brand-100" style={{ top: (m - o) * PX }} />)}
                {/* off-shift shading */}
                {ws > o && <div className="absolute inset-x-0 top-0 bg-brand-100/40" style={{ height: (ws - o) * PX }} />}
                {we < c && <div className="absolute inset-x-0 bottom-0 bg-brand-100/40" style={{ height: (c - we) * PX }} />}
                {leave.map((t, i) => {
                  const s = toIst(new Date(t.start_at)), e = toIst(new Date(t.end_at));
                  const sm = s.date < date ? o : Math.max(o, s.minutes), em = e.date > date ? c : Math.min(c, e.minutes);
                  if (em <= sm) return null;
                  return (
                    <div key={i} className="absolute inset-x-1 flex items-start gap-1 rounded-lg border border-dashed border-brand-300 p-1.5 text-[10px] text-brand-900/60"
                      style={{ top: (sm - o) * PX, height: (em - sm) * PX - 2, backgroundImage: "repeating-linear-gradient(45deg, rgba(126,63,117,.07) 0 6px, transparent 6px 12px)" }}>
                      <Ban className="h-3 w-3 shrink-0" aria-hidden />{t.reason ?? "Leave"}
                    </div>
                  );
                })}
                {mine.map(block)}
                {nowMin !== null && <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500" style={{ top: (nowMin - o) * PX }}><span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-rose-500" /></div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CategoryLegend({ categories }: { categories: string[] }) {
  const uniq = [...new Set(categories.map((c) => c.toLowerCase()))];
  if (!uniq.length) return null;
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      {uniq.map((c) => { const k = category(c); return <span key={c} className="inline-flex items-center gap-1 text-brand-900/60"><span className={`h-2 w-2 rounded-full ${k.dot}`} />{k.label}</span>; })}
      <span className="inline-flex items-center gap-1 text-brand-900/60"><span className="rounded bg-red-500 px-1 text-[9px] font-bold text-white">!</span>no-show risk</span>
    </div>
  );
}
