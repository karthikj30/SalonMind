import Link from "next/link";
import { ArrowRight, CalendarPlus, CheckCircle2, Circle, MessagesSquare, Play, Store } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { computeDatasets, DEFAULT_LAYOUT, type Widget } from "@/lib/services/metrics";
import { WidgetGrid } from "@/components/Widgets";
import { DayCalendar } from "@/components/DayCalendar";
import { Card, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { runAgentNow } from "./actions";
import { istDate, todayIst, toIst } from "@/lib/time";

function greeting() {
  const h = Math.floor(toIst(new Date()).minutes / 60);
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const layout = (tenant.ui_layout as { widgets?: Widget[]; prompt?: string } | null);
  const widgets = layout?.widgets?.length ? layout.widgets : DEFAULT_LAYOUT;
  const today = todayIst();
  const [data, { count: staffCount }, { count: services }, { count: products }, { count: clients }, { data: staff }, { data: todays }, { count: pendingMsgs }] = await Promise.all([
    computeDatasets(db, tenant.id, widgets.map((w) => w.dataset)),
    db.from("staff").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    db.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    db.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    db.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    db.from("staff").select("id, name, work_start, work_end").eq("tenant_id", tenant.id).eq("active", true).order("name"),
    db.from("bookings").select("id, start_at, end_at, status, staff_id, no_show_risk, services(name, category), clients(name)").eq("tenant_id", tenant.id)
      .gte("start_at", istDate(today, "00:00").toISOString()).lte("start_at", istDate(today, "23:59").toISOString()),
    db.from("conversations").select("contact_handle", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("status", "human"),
  ]);
  const steps = [
    { ok: (staffCount ?? 0) > 0, label: "Add your stylists", href: "/app/staff" },
    { ok: (services ?? 0) > 0, label: "Add services, rooms & stations", href: "/app/services" },
    { ok: (products ?? 0) > 0, label: "Add products & vendors", href: "/app/inventory" },
    { ok: (clients ?? 0) > 0, label: "Add or import clients", href: "/app/clients" },
  ];
  const live = (todays ?? []).filter((b) => b.status !== "cancelled");
  const dateLabel = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-plum-gradient bg-[length:200%_200%] p-6 text-white shadow-lift animate-gradient-x sm:p-8">
        <div className="salon-pattern absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -right-16 -top-16 h-64 w-64 animate-float rounded-full bg-gold-400/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-champ-300">{dateLabel}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{greeting()}, {tenant.name}</h1>
            <p className="mt-2 max-w-xl text-sm text-onplum/80">
              {live.length ? `${live.length} appointment${live.length === 1 ? "" : "s"} on the books today.` : "No appointments yet today."}
              {pendingMsgs ? ` ${pendingMsgs} conversation${pendingMsgs === 1 ? "" : "s"} waiting for a human.` : " Your agents are watching the inbox, stock and schedule."}
            </p>
            {layout?.prompt && <p className="mt-2 text-xs text-champ-200/80">✨ Layout generated in AI Studio: “{layout.prompt}”</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={runAgentNow}><input type="hidden" name="agent" value="all" />
              <SubmitButton pendingText="Agents working…" className="!bg-none !bg-champ-400 !text-ink hover:!bg-champ-300"><Play className="h-4 w-4" />Run all agents now</SubmitButton>
            </form>
            <Link href="/app/bookings" className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-medium backdrop-blur hover:bg-white/20"><CalendarPlus className="h-4 w-4" />New booking</Link>
            <Link href="/app/inbox" className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-medium backdrop-blur hover:bg-white/20"><MessagesSquare className="h-4 w-4" />Inbox</Link>
          </div>
        </div>
      </section>
      <Flash msg={sp.msg} error={sp.error} />
      {steps.some((s) => !s.ok) && (
        <Card title="Set up your salon" className="mb-6" icon={<Store className="h-4 w-4" />}>
          <ol className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={i}>
                <Link href={s.href} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition hover:shadow-soft ${s.ok ? "border-emerald-200 bg-emerald-50/50 text-emerald-900" : "border-brand-100 bg-ivory-50 text-brand-900 hover:border-brand-300"}`}>
                  {s.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-brand-300" />}
                  <span className="flex-1">{s.label}</span>{!s.ok && <ArrowRight className="h-3.5 w-3.5 text-brand-400" />}
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-brand-900/50">Then create bookings, complete them, send test messages in the Unified Inbox, and watch the Agent Console.</p>
        </Card>
      )}
      {(staff ?? []).length > 0 && (
        <Card title="Today at a glance" className="mb-6" actions={<Link href="/app/bookings" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">Open bookings <ArrowRight className="h-3 w-3" /></Link>}>
          {live.length ? <DayCalendar date={today} open={tenant.open_time} close={tenant.close_time} staff={staff ?? []} bookings={(todays ?? []) as never} isToday compact />
            : <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brand-200 bg-ivory-50 px-4 py-5 text-sm text-brand-900/60">
                <span>No appointments today yet — {staff!.length} stylist{staff!.length === 1 ? "" : "s"} free all day.</span>
                <Link href="/app/bookings" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"><CalendarPlus className="h-4 w-4" />Book the first one</Link>
              </div>}
        </Card>
      )}
      <WidgetGrid widgets={widgets} data={data} />
    </>
  );
}
