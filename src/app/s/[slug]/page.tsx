import Link from "next/link";
import { notFound } from "next/navigation";
import { botClient } from "@/lib/supabase/bot";
import { normalizeTenant } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";
import { planBooking } from "@/lib/services/booking";
import { fmtDateTime, inr, todayIst, toIst } from "@/lib/time";
import { LANGUAGES } from "@/lib/ai/llm";
import { marketplaceBook } from "./actions";
import { ChatWidget } from "./ChatWidget";
import { SubmitButton } from "@/components/SubmitButton";
import { upiLink } from "@/lib/domain/upi";
import { qrSvg } from "@/lib/services/qr";
import { category, monogram } from "@/lib/ui/categories";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguagePicker } from "@/components/LanguagePicker";
import { getDict } from "@/lib/i18n/server";
import { isRtl } from "@/lib/i18n/ui";
import { fill } from "@/lib/i18n/ui";
import { ArrowLeft, CheckCircle2, Clock, MapPin, Star, Ticket } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await botClient();
  const { data } = await db.from("tenants").select("name, city, description").eq("slug", slug).maybeSingle();
  return data ? { title: `${data.name}${data.city ? ", " + data.city : ""}`, description: data.description ?? undefined } : {};
}

export default async function SalonPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { lang, t: tx } = await getDict();
  const db = await botClient();
  const { data: t } = await db.from("tenants").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!t) notFound();
  const tenant = normalizeTenant(t as Tenant);
  const [{ data: services }, { data: deals }] = await Promise.all([
    db.from("services").select("id, name, category, description, base_price, duration_min").eq("tenant_id", tenant.id).eq("active", true).order("category"),
    db.from("deals").select("title, description, discount_pct, valid_to, service_id").eq("tenant_id", tenant.id).eq("active", true).gte("valid_to", new Date().toISOString()),
  ]);
  const serviceId = sp.service ?? services?.[0]?.id;
  const date = sp.date && sp.date !== "null" ? sp.date : todayIst();
  const plan = serviceId ? await planBooking(db, tenant, { service_id: serviceId, date }, 12).catch(() => null) : null;
  const slots = (plan?.slots ?? []).sort((a, b) => a.start.getTime() - b.start.getTime());
  type Booked = { start_at: string; price: number; deposit_required: number; services: { name: string } | null; staff: { name: string } | null };
  let booked: Booked | null = null;
  let payQr: { link: string; svg: string } | null = null;
  if (sp.booked) booked = (await db.from("bookings").select("start_at, price, deposit_required, no_show_risk, services(name), staff(name)").eq("id", sp.booked).eq("tenant_id", tenant.id).single()).data as unknown as Booked;
  if (booked && Number(booked.deposit_required) > 0 && tenant.upi_vpa) {
    try { const link = upiLink({ vpa: tenant.upi_vpa, name: tenant.name, amount: Number(booked.deposit_required), note: `Deposit ${booked.services?.name ?? ""}`.trim(), ref: String(sp.booked).slice(0, 12) }); payQr = { link, svg: await qrSvg(link) }; } catch { /* bad VPA */ }
  }
  // real social proof from completed visits (no fabricated reviews)
  const { data: rated } = await db.from("bookings").select("rating").eq("tenant_id", tenant.id).eq("status", "completed").not("rating", "is", null);
  const ratingCount = rated?.length ?? 0;
  const ratingAvg = ratingCount ? (rated!.reduce((a, r) => a + Number(r.rating), 0) / ratingCount) : null;
  const m = monogram(tenant.name);
  const grouped = new Map<string, NonNullable<typeof services>>();
  (services ?? []).forEach((sv) => grouped.set(sv.category, [...(grouped.get(sv.category) ?? []), sv]));
  const selected = (services ?? []).find((sv) => sv.id === serviceId);
  const input = "w-full rounded-xl border border-brand-200/80 bg-ivory-50 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";
  return (
    <main lang={lang} dir={isRtl(lang) ? "rtl" : undefined}>
      <header className={`relative bg-gradient-to-br ${m.gradient} text-white`}>
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-5">
          <div className="flex items-center justify-between"><Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white"><ArrowLeft className="h-4 w-4" />{tx.back}</Link><div className="flex items-center gap-1"><LanguagePicker value={lang} label={tx.language} className="text-white/85 hover:bg-white/10" /><ThemeToggle className="text-white/85" /></div></div>
        </div>
      </header>
      <div className="relative z-10 mx-auto max-w-5xl px-4">
        <div className="-mt-12 flex flex-wrap items-start gap-x-5 gap-y-2">
          <span className={`grid h-24 w-24 animate-scale-in place-items-center rounded-3xl border-4 border-ivory-100 bg-gradient-to-br font-display text-3xl font-semibold text-white shadow-lift ${m.gradient}`}>{m.initials}</span>
          <div className="sm:pt-14">
            <h1 className="font-display text-3xl font-semibold text-brand-900">{tenant.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-900/60">
              {(tenant.address || tenant.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[tenant.address, tenant.city].filter(Boolean).join(", ")}</span>}
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /><bdi dir="ltr">{tenant.open_time.slice(0, 5)}–{tenant.close_time.slice(0, 5)}</bdi></span>
              {ratingAvg !== null && <span className="inline-flex items-center gap-1 text-gold-700"><Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" />{ratingAvg.toFixed(1)} · {ratingCount} {ratingCount === 1 ? tx.rating : tx.ratings}</span>}
            </p>
          </div>
        </div>
        {tenant.description && <p dir="auto" className="mt-4 max-w-2xl text-sm leading-relaxed text-brand-900/70">{tenant.description}</p>}
        {sp.error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{sp.error}</p>}
        {booked && (
          <div className="mt-5 animate-fade-in rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 className="h-5 w-5" />{tx.booked}: {booked.services?.name} · {booked.staff?.name} · {fmtDateTime(booked.start_at)} — {inr(booked.price)} + GST</p>
            {Number(booked.deposit_required) > 0 ? <p className="mt-1 text-amber-800 dark:text-amber-300">{fill(tx.depositNote, { amt: inr(booked.deposit_required) })}</p> : <p className="mt-1 text-emerald-800 dark:text-emerald-300">{tx.confirmNote}</p>}
            {payQr && (
              <div className="mt-4 flex flex-wrap items-center gap-5">
                <div className="h-[180px] w-[180px] rounded-xl bg-[#fff] p-1 shadow-soft" dangerouslySetInnerHTML={{ __html: payQr.svg }} />
                <div className="text-xs text-brand-900/70"><p>{tx.scanPay}</p><a href={payQr.link} className="mt-2 inline-block rounded-xl bg-rose-gold px-4 py-2 font-medium text-white shadow-soft">{fill(tx.payVia, { amt: inr(booked.deposit_required) })}</a></div>
              </div>
            )}
          </div>
        )}
        {(deals ?? []).length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">{[...new Map(deals!.map((d) => [d.title, d])).values()].map((d, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700"><Ticket className="h-3 w-3" />{d.title}</span>)}</div>
        )}
        <div className="mt-8 grid gap-8 pb-28 lg:grid-cols-[1fr_380px]">
          <section>
            <h2 className="mb-4 font-display text-2xl font-semibold text-brand-900">{tx.serviceMenu}</h2>
            {[...grouped.entries()].map(([cat, list]) => {
              const c = category(cat); const Icon = c.icon;
              return (
                <div key={cat} className="mb-6 animate-fade-up">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-700"><Icon className="h-4 w-4" />{c.label}</h3>
                  <ul className="divide-y divide-brand-50 overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-soft">
                    {list.map((sv) => (
                      <li key={sv.id} className={`flex items-center justify-between gap-3 p-4 text-sm ${sv.id === serviceId ? "bg-brand-50/60" : ""}`}>
                        <div className="min-w-0"><p className="font-medium text-brand-900">{sv.name}</p>{sv.description && <p dir="auto" className="truncate text-xs text-brand-900/50">{sv.description}</p>}<p className="text-xs text-brand-900/45">{sv.duration_min} {tx.min}</p></div>
                        <div className="shrink-0 text-right"><p className="font-semibold text-brand-900">{inr(sv.base_price)}</p><Link href={`?service=${sv.id}&date=${date}#book`} className="text-xs font-medium text-brand-600 hover:underline">{sv.id === serviceId ? tx.selected : tx.pick}</Link></div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
          <section id="book" className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-brand-100 bg-surface p-5 shadow-lift">
              <h2 className="font-display text-xl font-semibold text-brand-900">{tx.book}</h2>
              {selected && <p className="text-xs text-brand-900/55">{selected.name} · {selected.duration_min} {tx.min}</p>}
              <form className="mb-4 mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm">
                <select name="service" defaultValue={serviceId} className={`${input} col-span-2`} aria-label="Service">{(services ?? []).map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}</select>
                <input type="date" name="date" defaultValue={date} min={todayIst()} className={input} aria-label="Date" />
                <button className="rounded-xl border border-brand-200 px-3 hover:bg-brand-50">{tx.check}</button>
              </form>
              {slots.length ? (
                <form action={marketplaceBook} className="space-y-3 text-sm">
                  <input type="hidden" name="slug" value={slug} /><input type="hidden" name="service_id" value={serviceId} /><input type="hidden" name="date" value={date} />
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-brand-900/60">{tx.chooseTime}</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((sl) => {
                        const tm = toIst(sl.start).time;
                        return (
                          <label key={tm} className="cursor-pointer">
                            <input type="radio" name="time" value={tm} defaultChecked={sp.time === tm} required className="peer sr-only" />
                            <span className="block rounded-xl border border-brand-200 px-2 py-1.5 text-center text-xs transition hover:-translate-y-0.5 peer-checked:scale-[1.03] peer-checked:border-brand-600 peer-checked:bg-rose-gold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 hover:border-brand-400">
                              <span className="block font-semibold">{tm}</span><span className="opacity-75">{inr(sl.quote.price)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <input name="name" required placeholder={tx.yourName} autoComplete="name" className={input} />
                  <input name="phone" required placeholder={tx.mobile} autoComplete="tel" inputMode="tel" className={input} />
                  <select name="language" className={input} aria-label={tx.language} defaultValue={lang}>{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <label className="flex items-center gap-2 text-xs text-brand-900/55"><input type="checkbox" name="consent" defaultChecked /> {tx.consent}</label>
                  <SubmitButton className="w-full !py-2.5">{tx.confirmBooking}</SubmitButton>
                  <p className="text-center text-[11px] text-brand-900/40">{tx.priceNote}</p>
                </form>
              ) : <p className="rounded-xl border border-dashed border-brand-200 bg-ivory-50 p-4 text-center text-sm text-brand-900/55">{fill(tx.noSlotsOn, { date })}</p>}
            </div>
          </section>
        </div>
      </div>
      <ChatWidget slug={slug} salon={tenant.name} t={{ chatBtn: tx.chatBtn, chatSub: tx.chatSub, chatIntro: tx.chatIntro, mobilePh: tx.mobilePh, msgPh: tx.msgPh, online: tx.online, typing: tx.typing, openWa: tx.openWa }} phone={tenant.phone} rtl={isRtl(lang)} />
    </main>
  );
}
