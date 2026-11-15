import Link from "next/link";
import { MapPin, Store, Ticket } from "lucide-react";
import { botClient } from "@/lib/supabase/bot";
import { fmtDateTime } from "@/lib/time";
import { monogram } from "@/lib/ui/categories";
import { Logo } from "@/components/Logo";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguagePicker } from "@/components/LanguagePicker";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a salon" };

export default async function Marketplace() {
  const { lang, t } = await getDict();
  const KIND = t.dealKinds;
  let deals: { id: string; title: string; description: string | null; discount_pct: number; kind: string; valid_to: string; tenants: { name: string; slug: string; city: string | null } | null }[] = [];
  let salons: { id: string; name: string; slug: string; city: string | null; description: string | null }[] = [];
  try {
    const db = await botClient();
    const [d, s] = await Promise.all([
      db.from("deals").select("id, title, description, discount_pct, kind, valid_to, tenants!inner(name, slug, city, is_published)").eq("active", true).eq("tenants.is_published", true).gte("valid_to", new Date().toISOString()).order("created_at", { ascending: false }).limit(12),
      db.from("tenants").select("id, name, slug, city, description").eq("is_published", true).order("created_at", { ascending: false }).limit(24),
    ]);
    deals = (d.data ?? []) as unknown as typeof deals;
    salons = s.data ?? [];
  } catch { /* not configured */ }
  return (
    <main>
      <section className="relative bg-plum-gradient text-white">
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-6">
          <nav className="mb-10 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2"><Logo className="h-8 w-8" /><span className="font-display text-lg font-semibold">SalonMind</span></Link>
            <div className="flex items-center gap-1"><LanguagePicker value={lang} label={t.language} className="text-onplum hover:bg-white/10" /><ThemeToggle className="text-onplum" /><Link href="/signup" className="hidden rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 sm:inline-flex">{t.listSalon}</Link></div>
          </nav>
          <h1 className="animate-fade-up font-display text-3xl font-semibold sm:text-5xl">{t.findTitle}</h1>
          <p className="mt-2 text-onplum/80">{t.findSub}</p>
          <div className="mt-6"><SearchBox t={t} /></div>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold text-brand-900"><Ticket className="h-5 w-5 text-rose-500" />{t.liveDeals}</h2>
          {deals.length ? (
            <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deals.map((d) => (
                <Link key={d.id} href={`/s/${d.tenants?.slug}`} className="group lift relative flex overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-soft">
                  <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-rose-gold text-white">
                    {d.discount_pct > 0 ? <><span className="font-display text-2xl font-semibold">{d.discount_pct}%</span><span className="text-[10px] uppercase tracking-wider">{t.off}</span></> : <span className="px-1 text-center text-[10px] font-semibold uppercase tracking-wider">{KIND[d.kind] ?? "Deal"}</span>}
                  </div>
                  <div className="relative flex-1 border-l-2 border-dashed border-brand-100 p-4">
                    <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-ivory-100" aria-hidden /><span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-ivory-100" aria-hidden />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">{KIND[d.kind] ?? d.kind}</p>
                    <p className="mt-0.5 font-medium text-brand-900">{d.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-brand-900/55"><Store className="h-3 w-3" />{d.tenants?.name}{d.tenants?.city && <> · <MapPin className="h-3 w-3" />{d.tenants.city}</>}</p>
                    <p className="mt-1 text-[11px] text-brand-900/40">{t.until} {fmtDateTime(d.valid_to)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : <p className="rounded-2xl border border-dashed border-brand-200 bg-surface p-6 text-center text-sm text-brand-900/50">{t.noDeals}</p>}
        </section>
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold text-brand-900"><Store className="h-5 w-5 text-brand-500" />{t.salons}</h2>
          {salons.length ? (
            <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {salons.map((s) => {
                const m = monogram(s.name);
                return (
                  <Link key={s.id} href={`/s/${s.slug}`} className="group lift overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-soft">
                    <div className={`relative h-24 overflow-hidden bg-gradient-to-br ${m.gradient}`}><div className="salon-pattern absolute inset-0 opacity-40 transition-transform duration-700 group-hover:scale-110" /></div>
                    <div className="relative -mt-8 px-4 pb-4">
                      <span className={`grid h-14 w-14 place-items-center rounded-2xl border-4 border-white bg-gradient-to-br font-display text-lg font-semibold text-white shadow-soft ${m.gradient}`}>{m.initials}</span>
                      <p className="mt-2 font-semibold text-brand-900 group-hover:text-brand-600">{s.name}</p>
                      <p className="flex items-center gap-1 text-xs text-brand-900/55"><MapPin className="h-3 w-3" />{s.city}</p>
                      {s.description && <p className="mt-1.5 line-clamp-2 text-xs text-brand-900/60">{s.description}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : <p className="rounded-2xl border border-dashed border-brand-200 bg-surface p-6 text-center text-sm text-brand-900/50">{t.noSalons}</p>}
        </section>
      </div>
    </main>
  );
}
