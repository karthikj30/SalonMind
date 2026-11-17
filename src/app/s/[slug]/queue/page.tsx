import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, Clock, Ticket, Users } from "lucide-react";
import { botClient } from "@/lib/supabase/bot";
import { normalizeTenant } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";
import { queueState } from "@/lib/services/queue";
import { getDict } from "@/lib/i18n/server";
import { fill, isRtl, type Dict } from "@/lib/i18n/ui";
import { LanguagePicker } from "@/components/LanguagePicker";
import { qrSvg } from "@/lib/services/qr";
import { SubmitButton } from "@/components/SubmitButton";
import { queueJoin } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Walk-in queue" };

/** Wait time in the visitor's language, rounded to 5 minutes so the number does not flicker. */
function waitText(min: number | null, t: Dict) {
  if (min === null) return t.wFull;
  const m = Math.round(min / 5) * 5;
  if (m <= 0) return t.wNow;
  if (m < 60) return fill(t.wMin, { m: String(m) });
  return m % 60 ? fill(t.wHourMin, { h: String(Math.floor(m / 60)), m: String(m % 60) }) : fill(t.wHour, { h: String(m / 60) });
}

/**
 * Public walk-in queue: shows which token is being served and the wait, lets a customer take a token by
 * scanning the QR at the reception, and doubles as the waiting-area display. Names are never shown.
 */
export default async function QueuePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { lang, t } = await getDict();
  const wl = (m: number | null) => waitText(m, t);
  const db = await botClient();
  const { data: row } = await db.from("tenants").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!row) notFound();
  const tenant = normalizeTenant(row as Tenant);
  const [q, { data: services }] = await Promise.all([
    queueState(db, tenant),
    db.from("services").select("id, name, duration_min").eq("tenant_id", tenant.id).eq("active", true).order("name"),
  ]);
  const mine = sp.t ? q.waiting.find((w) => w.id === sp.t) : undefined;
  const mineServing = sp.t ? q.serving.find((w) => w.id === sp.t) : undefined;
  const h = await headers();
  const url = `${process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`}/s/${slug}/queue`;
  const qr = await qrSvg(url, 168);
  const nextWait = q.waiting.length ? q.waiting[q.waiting.length - 1].eta.waitMin : 0;
  const input = "w-full rounded-xl border border-brand-200 bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200";
  return (
    <main className="min-h-screen bg-ivory-100" lang={lang} dir={isRtl(lang) ? "rtl" : undefined}>
      <meta httpEquiv="refresh" content="30" />
      <header className="relative overflow-hidden bg-plum-gradient px-4 pb-10 pt-5 text-white sm:px-8">
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-2"><Link href={`/s/${slug}`} className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{tenant.name}</Link><LanguagePicker value={lang} label={t.language} className="text-white/85 hover:bg-white/10" /></div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-champ-300">{t.qTitle}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{q.nowServing ? <>{t.nowServing} <span className="text-champ-300">#{q.nowServing}</span></> : t.noneServing}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Users className="h-4 w-4" />{fill(t.nWaiting, { n: String(q.waiting.length) })}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Clock className="h-4 w-4" />{fill(t.newWait, { wait: wl(q.waiting.length ? (nextWait === null ? null : nextWait + 15) : 0) })}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto -mt-6 grid max-w-4xl gap-4 px-4 pb-16 sm:px-8 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          {(mine || mineServing) && (
            <section className="animate-fade-up rounded-2xl border-2 border-gold-400 bg-surface p-5 text-center shadow-glow" aria-live="polite" data-my-token>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">{t.yourToken}</p>
              <p className="mt-1 font-display text-6xl font-semibold text-brand-900">#{(mine ?? mineServing)!.token_no}</p>
              {mineServing ? <p className="mt-2 text-sm font-medium text-emerald-700">{t.yourTurnNow}</p> : (
                <p className="mt-2 text-sm text-brand-900/70">{mine!.eta.position - 1 === 0 ? t.youAreNext : fill(t.nAhead, { n: String(mine!.eta.position - 1) })} · <b>{fill(t.turnIn, { wait: wl(mine!.eta.waitMin) })}</b></p>
              )}
              <p className="mt-2 text-xs text-brand-900/45">{t.autoRefresh}</p>
            </section>
          )}
          {sp.t && !mine && !mineServing && <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900/70">{t.tokenGone}</p>}
          {sp.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</p>}

          <section className="rounded-2xl border border-brand-100/80 bg-surface p-5 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-brand-900"><Ticket className="h-5 w-5 text-gold-600" />{t.takeToken}</h2>
            <p className="mt-1 text-sm text-brand-900/60">{t.takeTokenSub}</p>
            <form action={queueJoin} className="mt-4 space-y-2.5">
              <input type="hidden" name="slug" value={slug} />
              <input name="name" required placeholder={t.yourName} autoComplete="name" className={input} aria-label={t.yourName} />
              <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder={t.mobile} className={input} aria-label={t.mobile} />
              <select name="service_id" required className={input} aria-label="Service">{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min</option>)}</select>
              <SubmitButton className="w-full !py-2.5" pendingText={t.gettingToken}>{t.getToken}</SubmitButton>
            </form>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-brand-100/80 bg-surface p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-brand-900">{t.inQueue}</h2>
            <ol className="mt-3 space-y-1.5 text-sm" data-public-queue>
              {q.serving.map((w) => <li key={w.id} className="flex items-center justify-between rounded-lg bg-emerald-100/70 px-3 py-1.5"><b className="font-mono">#{w.token_no}</b><span className="text-xs text-emerald-800">{t.beingServed}</span></li>)}
              {q.waiting.map((w) => <li key={w.id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${w.id === sp.t ? "bg-gold-100 font-semibold" : "bg-ivory-100"}`}><b className="font-mono">#{w.token_no}</b><span className="text-xs text-brand-900/60">{wl(w.eta.waitMin)}</span></li>)}
              {!q.serving.length && !q.waiting.length && <li className="text-brand-900/45">{t.queueEmpty}</li>}
            </ol>
          </section>
          <section className="rounded-2xl border border-brand-100/80 bg-surface p-5 text-center shadow-soft">
            <div className="mx-auto w-fit rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-2 text-xs text-brand-900/55">{fill(t.scanJoin, { salon: tenant.name })}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
