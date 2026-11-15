"use client";
import Link from "next/link";
import { useState } from "react";
import { Camera, Clock, MapPin, Search, Sparkles, Ticket } from "lucide-react";

import { CHIP_QUERIES, type Dict } from "@/lib/i18n/ui";

type Result = {
  tenant: { name: string; slug: string; city: string | null };
  service: { id: string; name: string; category: string; base_price: number; duration_min: number };
  similarity: number; price: number; deal: { title: string; discount_pct: number } | null; slots: { time: string; price: number; staff: string }[];
};

async function toBase64(file: File): Promise<{ mime: string; base64: string }> {
  // downscale to keep payloads small on 4G
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 768 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * scale; c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.8);
  return { mime: "image/jpeg", base64: url.split(",")[1] };
}

export function SearchBox({ t }: { t: Dict }) {
  const [q, setQ] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [advisor, setAdvisor] = useState(false);
  const [data, setData] = useState<{ results: Result[]; trace: string[]; date: string | null; error?: string; advice?: { face_shape: string; styles: { name: string; why: string }[] } | null } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const image = file ? await toBase64(file) : undefined;
      const res = await fetch("/api/marketplace/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, image, mode: advisor ? "advisor" : "match" }) });
      setData(await res.json());
    } finally { setLoading(false); }
  }

  return (
    <div>
      <form onSubmit={search} className="flex flex-col gap-2 rounded-2xl bg-surface p-2 shadow-lift sm:flex-row">
        <div className="flex flex-1 items-center gap-2 px-2">
          <Search className="h-5 w-5 shrink-0 text-brand-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchLabel} placeholder={t.searchPh} className="w-full bg-transparent py-2.5 text-sm text-brand-950 placeholder:text-brand-900/40 focus:outline-none" />
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-brand-100 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50">
          <Camera className="h-4 w-4" aria-hidden />{file ? file.name.slice(0, 14) : t.photo}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button disabled={loading} className="rounded-xl bg-rose-gold px-5 py-2.5 text-sm font-medium text-white shadow-soft hover:brightness-110 disabled:opacity-60">{loading ? t.searching : t.search}</button>
      </form>
      <label className="mt-3 flex items-center gap-2 text-xs text-onplum/90"><input type="checkbox" checked={advisor} onChange={(e) => setAdvisor(e.target.checked)} /> <Sparkles className="h-3.5 w-3.5 text-champ-300" />{t.advisor}</label>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {t.chips.map((label, i) => (
          <button key={label} type="button" onClick={() => setQ(CHIP_QUERIES[i])} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-white backdrop-blur hover:bg-white/20">{label}</button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {t.examples.map((s) => (
          <button key={s} type="button" onClick={() => setQ(s)} className="rounded-full px-2 py-1 text-onplum/70 underline decoration-dotted underline-offset-2 hover:text-white">{s}</button>
        ))}
      </div>
      {data && (
        <div className="mt-6 animate-fade-up rounded-2xl bg-ivory-100 p-4 text-brand-950 shadow-lift">
          {data.error && <p className="text-sm text-red-600">{data.error}</p>}
          {data.advice && (
            <div className="mb-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
              <p className="font-medium">{t.faceShape} <b>{data.advice.face_shape}</b>. {t.stylesSuit}</p>
              <ul className="mt-1 list-disc pl-5 text-xs">{data.advice.styles.map((s, i) => <li key={i}><b>{s.name}</b> — {s.why}</li>)}</ul>
            </div>
          )}
          <details className="mb-3 text-xs text-brand-900/55"><summary className="cursor-pointer">{t.howUnderstood}</summary><ul className="mt-1 list-disc pl-4">{data.trace?.map((t, i) => <li key={i} className="break-all">{t}</li>)}</ul></details>
          {data.results?.length === 0 && <p className="text-sm text-brand-900/55">{t.noResults}</p>}
          <div className="space-y-3">
            {data.results?.map((r, i) => (
              <div key={i} className="rounded-2xl border border-brand-100 bg-surface p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><Link href={`/s/${r.tenant.slug}`} className="font-semibold text-brand-900 hover:text-brand-600">{r.tenant.name}</Link><p className="flex items-center gap-1 text-xs text-brand-900/55"><MapPin className="h-3 w-3" />{r.tenant.city} · {t.match} {Math.round(r.similarity * 100)}%</p></div>
                  <div className="text-right"><p className="font-medium">{r.service.name}</p><p className="text-sm">{r.deal ? <><s className="text-brand-900/40">₹{r.service.base_price}</s> <b className="text-brand-700">₹{r.price}</b></> : <>₹{r.price}</>} <span className="text-xs text-brand-900/40">+GST · {r.service.duration_min}m</span></p></div>
                </div>
                {r.deal && <p className="mt-1 flex items-center gap-1 text-xs text-rose-600"><Ticket className="h-3 w-3" />{r.deal.title}</p>}
                {r.slots.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.slots.map((s) => <Link key={s.time} href={`/s/${r.tenant.slug}?service=${r.service.id}&date=${data.date}&time=${s.time}`} className="inline-flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:border-brand-500 hover:bg-brand-100"><Clock className="h-3 w-3" />{s.time} · ₹{s.price} · {s.staff}</Link>)}
                  </div>
                ) : data.date ? <p className="mt-2 text-xs text-brand-900/40">{t.noSlotsWindow}</p> : <Link href={`/s/${r.tenant.slug}?service=${r.service.id}`} className="mt-2 inline-block text-xs text-brand-600">{t.seeAvailability}</Link>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
