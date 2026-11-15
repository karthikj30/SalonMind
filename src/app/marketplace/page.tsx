import Link from "next/link";
import { botClient } from "@/lib/supabase/bot";
import { fmtDateTime } from "@/lib/time";
import { SearchBox } from "./SearchBox";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-brand-700">✂️ SalonMind</Link>
        <Link href="/signup" className="text-sm text-slate-600 hover:text-brand-600">List your salon →</Link>
      </nav>
      <h1 className="text-2xl font-bold">Find your next salon visit</h1>
      <p className="mb-4 text-sm text-slate-500">Ask in plain language (English, Hindi, Tamil…) or upload a photo of a look you love.</p>
      <SearchBox />
      <section className="mt-10">
        <h2 className="mb-3 font-semibold">🔥 Live deals across India</h2>
        {deals.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((d) => (
              <Link key={d.id} href={`/s/${d.tenants?.slug}`} className="rounded-xl border bg-white p-4 shadow-sm hover:border-brand-500">
                <div className="flex justify-between text-xs"><span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-800">{d.kind.replace("_", "-")}</span>{d.discount_pct > 0 && <b className="text-brand-700">{d.discount_pct}% off</b>}</div>
                <p className="mt-2 font-medium">{d.title}</p>
                <p className="text-xs text-slate-500">{d.tenants?.name} · {d.tenants?.city}</p>
                <p className="mt-1 text-xs text-slate-500">{d.description}</p>
                <p className="mt-1 text-[11px] text-slate-400">until {fmtDateTime(d.valid_to)}</p>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">No live deals right now — salons' Yield Agents publish them as slots open up.</p>}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 font-semibold">Salons</h2>
        {salons.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {salons.map((s) => (
              <Link key={s.id} href={`/s/${s.slug}`} className="rounded-xl border bg-white p-4 shadow-sm hover:border-brand-500">
                <p className="font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.city}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{s.description}</p>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">No salons listed yet.</p>}
      </section>
    </main>
  );
}
