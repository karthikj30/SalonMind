import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { CalendarClock, CheckCircle2, Phone, Scissors, User, XCircle } from "lucide-react";
import { botClient } from "@/lib/supabase/bot";
import { normalizeTenant } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";
import { planBooking } from "@/lib/services/booking";
import { MANAGE_CUTOFF_HOURS, manageWindow } from "@/lib/domain/prepaid";
import { fmtDateTime, inr, todayIst, toIst } from "@/lib/time";
import { monogram } from "@/lib/ui/categories";
import { LanguagePicker } from "@/components/LanguagePicker";
import { SubmitButton } from "@/components/SubmitButton";
import { LANG_COOKIE, isRtl, fill } from "@/lib/i18n/ui";
import { manageDict } from "@/lib/i18n/manage";
import { loadTranslations } from "@/lib/agents/i18n";
import { cancelByToken, rescheduleByToken } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your appointment", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Customer self-service: the link in the confirmation lets the customer see, move or cancel their own
 * appointment without calling. Shows only that booking — no phone numbers or other customers.
 */
export default async function ManageBooking({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!UUID.test(token)) notFound();
  const db = await botClient();
  const { data: b } = await db.from("bookings").select("id, tenant_id, service_id, staff_id, start_at, status, price, clients(language), services(name, duration_min), staff(name)").eq("manage_token", token).maybeSingle();
  if (!b) notFound();
  const { data: row } = await db.from("tenants").select("*").eq("id", b.tenant_id).single();
  const tenant = normalizeTenant(row as Tenant);
  // the visitor's chosen language, else the language the customer booked in
  const clientLang = (b.clients as unknown as { language: string } | null)?.language;
  const lang = (await cookies()).get(LANG_COOKIE)?.value ?? clientLang ?? "en";
  const t = manageDict(lang);
  const L = await loadTranslations(db, lang === "en" ? [] : [tenant.id], lang);
  const service = b.services as unknown as { name: string; duration_min: number } | null;
  const stylist = b.staff as unknown as { name: string } | null;
  const w = manageWindow(b, new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : null;
  const earliest = Date.now() + MANAGE_CUTOFF_HOURS * 3_600_000;
  const slots = w.canChange && date && b.service_id
    ? ((await planBooking(db, tenant, { service_id: b.service_id, date, staff_id: b.staff_id, excludeBookingId: b.id }, 12).catch(() => null))?.slots ?? [])
      .filter((s) => s.start.getTime() >= earliest).sort((a, c) => a.start.getTime() - c.start.getTime())
    : [];
  const m = monogram(tenant.name);
  const known = ["past", "closed", "too_late"];
  const errText = sp.error === "too_late" ? fill(t.tooLate, { h: String(MANAGE_CUTOFF_HOURS) }) : sp.error && known.includes(sp.error) ? t.closed : sp.error;
  const input = "w-full rounded-xl border border-brand-200/80 bg-ivory-50 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";
  const statusTone = b.status === "cancelled" ? "bg-red-50 text-red-700 ring-red-200" : b.status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gold-50 text-gold-700 ring-gold-200";

  return (
    <main lang={lang} dir={isRtl(lang) ? "rtl" : undefined} className="min-h-screen bg-ivory-100 pb-16">
      <header className={`relative bg-gradient-to-br ${m.gradient} text-white`}>
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-white/40 font-display text-lg font-semibold">{m.initials}</span>
            <div className="min-w-0"><p className="truncate font-display text-lg font-semibold">{tenant.name}</p><p className="text-xs text-white/75">{t.title}</p></div>
          </div>
          <LanguagePicker value={lang} label="Language" className="text-white/90" />
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-5">
        {sp.done === "cancelled" && <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" />{t.cancelled}</p>}
        {sp.done === "moved" && <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" />{fill(t.moved, { when: fmtDateTime(b.start_at) })}</p>}
        {errText && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errText}</p>}

        <section className="rounded-2xl border border-brand-100 bg-surface p-5 shadow-soft" data-manage-booking>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold text-brand-900">{t.title}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone}`} data-status={b.status}>{t.status[b.status] ?? b.status}</span>
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="flex items-center gap-1.5 text-brand-900/55"><Scissors className="h-4 w-4" />{t.service}</dt><dd className="font-medium text-brand-900">{L(service?.name ?? "")}</dd>
            <dt className="flex items-center gap-1.5 text-brand-900/55"><CalendarClock className="h-4 w-4" />{t.when}</dt><dd className="font-medium text-brand-900"><bdi dir="ltr">{fmtDateTime(b.start_at)}</bdi></dd>
            {stylist && <><dt className="flex items-center gap-1.5 text-brand-900/55"><User className="h-4 w-4" />{t.stylist}</dt><dd className="text-brand-900">{stylist.name}</dd></>}
            <dt className="text-brand-900/55">{t.price}</dt><dd className="text-brand-900">{inr(b.price)} {t.plusGst}</dd>
          </dl>
        </section>

        {w.canChange ? (
          <>
            <section className="rounded-2xl border border-brand-100 bg-surface p-5 shadow-soft">
              <h2 className="font-display text-lg font-semibold text-brand-900">{t.change}</h2>
              <form className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm">
                <input type="date" name="date" defaultValue={date ?? toIst(new Date(b.start_at)).date} min={todayIst()} className={input} aria-label={t.pickDate} />
                <button className="rounded-xl border border-brand-200 px-3 hover:bg-brand-50">{t.showTimes}</button>
              </form>
              {date && (slots.length ? (
                <form action={rescheduleByToken} className="mt-4 space-y-3">
                  <input type="hidden" name="token" value={token} /><input type="hidden" name="date" value={date} />
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {[...new Map(slots.map((s) => [toIst(s.start).time, s])).values()].map((s) => {
                      const tm = toIst(s.start).time;
                      return (
                        <label key={tm} className="cursor-pointer">
                          <input type="radio" name="time" value={tm} required className="peer sr-only" />
                          <span className="block rounded-xl border border-brand-200 px-2 py-1.5 text-center text-xs font-semibold transition peer-checked:border-brand-600 peer-checked:bg-rose-gold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300"><bdi dir="ltr">{tm}</bdi></span>
                        </label>
                      );
                    })}
                  </div>
                  <SubmitButton className="w-full">{t.moveHere}</SubmitButton>
                </form>
              ) : <p className="mt-3 rounded-xl border border-dashed border-brand-200 bg-ivory-50 p-3 text-center text-sm text-brand-900/55">{t.noTimes}</p>)}
            </section>
            <details className="rounded-2xl border border-brand-100 bg-surface p-5 shadow-soft">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-red-700"><XCircle className="h-4 w-4" />{t.cancel}</summary>
              <form action={cancelByToken} className="mt-3"><input type="hidden" name="token" value={token} /><SubmitButton variant="danger" className="w-full">{t.cancelSure}</SubmitButton></form>
            </details>
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-brand-200 bg-ivory-50 p-4 text-sm text-brand-900/60">
            {w.reason === "too_late" ? fill(t.tooLate, { h: String(MANAGE_CUTOFF_HOURS) }) : t.closed}
          </p>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          {tenant.phone && <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-surface px-3.5 py-2 text-brand-800 hover:bg-brand-50"><Phone className="h-4 w-4" />{t.call}</a>}
          {tenant.is_published && <Link href={`/s/${tenant.slug}`} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-gold px-3.5 py-2 font-medium text-white shadow-soft">{t.bookAgain}</Link>}
        </div>
      </div>
    </main>
  );
}
