import Link from "next/link";
import { MapPin, Store, Ticket } from "lucide-react";
import { botClient } from "@/lib/supabase/bot";
import { fmtDateTime } from "@/lib/time";
import { monogram } from "@/lib/ui/categories";
import { Logo } from "@/components/Logo";
import { SearchBox } from "./SearchBox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a salon" };

const KIND: Record<string, string> = { offpeak: "Off-peak", last_minute: "Last-minute", festival: "Festival", flash: "Flash", manual: "Offer" };

export default async function Marketplace() {
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
            <Link href="/signup" className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">List your salon →</Link>
          </nav>
          <h1 className="font-display text-3xl font-semibold sm:text-5xl">Find your next salon visit</h1>
          <p className="mt-2 text-brand-100/80">Ask in plain language — English, हिंदी, தமிழ் … — or upload a photo of a look you love.</p>
          <div className="mt-6"><SearchBox /></div>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold text-brand-900"><Ticket className="h-5 w-5 text-rose-500" />Live deals across India</h2>
          {deals.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deals.map((d) => (
                <Link key={d.id} href={`/s/${d.tenants?.slug}`} className="group relative flex overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-rose-gold text-white">
                    {d.discount_pct > 0 ? <><span className="font-display text-2xl font-semibold">{d.discount_pct}%</span><span className="text-[10px] uppercase tracking-wider">off</span></> : <span className="px-1 text-center text-[10px] font-semibold uppercase tracking-wider">{KIND[d.kind] ?? "Deal"}</span>}
                  </div>
                  <div className="relative flex-1 border-l-2 border-dashed border-brand-100 p-4">
                    <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-ivory-100" aria-hidden /><span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-ivory-100" aria-hidden />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">{KIND[d.kind] ?? d.kind}</p>
                    <p className="mt-0.5 font-medium text-brand-900">{d.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-brand-900/55"><Store className="h-3 w-3" />{d.tenants?.name}{d.tenants?.city && <> · <MapPin className="h-3 w-3" />{d.tenants.city}</>}</p>
                    <p className="mt-1 text-[11px] text-brand-900/40">until {fmtDateTime(d.valid_to)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : <p className="rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-center text-sm text-brand-900/50">No live deals right now — each salon&apos;s Yield Agent publishes them as slots open up.</p>}
        </section>
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold text-brand-900"><Store className="h-5 w-5 text-brand-500" />Salons</h2>
          {salons.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {salons.map((s) => {
                const m = monogram(s.name);
                return (
                  <Link key={s.id} href={`/s/${s.slug}`} className="group overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className={`relative h-24 bg-gradient-to-br ${m.gradient}`}><div className="salon-pattern absolute inset-0 opacity-40" /></div>
                    <div className="-mt-8 px-4 pb-4">
                      <span className={`grid h-14 w-14 place-items-center rounded-2xl border-4 border-white bg-gradient-to-br font-display text-lg font-semibold text-white shadow-soft ${m.gradient}`}>{m.initials}</span>
                      <p className="mt-2 font-semibold text-brand-900 group-hover:text-brand-600">{s.name}</p>
                      <p className="flex items-center gap-1 text-xs text-brand-900/55"><MapPin className="h-3 w-3" />{s.city}</p>
                      {s.description && <p className="mt-1.5 line-clamp-2 text-xs text-brand-900/60">{s.description}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : <p className="rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-center text-sm text-brand-900/50">No salons listed yet.</p>}
        </section>
      </div>
    </main>
  );
}
