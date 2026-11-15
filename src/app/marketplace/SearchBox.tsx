"use client";
import Link from "next/link";
import { useState } from "react";

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

export function SearchBox() {
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
      <form onSubmit={search} className="flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm sm:flex-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='e.g. "balayage under ₹3000 in Mumbai available this evening"' className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <label className="flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          📷 {file ? file.name.slice(0, 14) : "Photo"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button disabled={loading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{loading ? "Searching…" : "Search"}</button>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={advisor} onChange={(e) => setAdvisor(e.target.checked)} /> ✨ Style advisor: upload a selfie and get cuts that suit your face shape (photo is analysed once, never stored)</label>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {["Balayage under ₹3000 available this evening", "Men's haircut and beard tomorrow morning", "Bridal makeup this weekend", "kal shaam facial 1500 ke andar"].map((s) => (
          <button key={s} onClick={() => setQ(s)} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200">{s}</button>
        ))}
      </div>
      {data && (
        <div className="mt-5">
          {data.error && <p className="text-sm text-red-600">{data.error}</p>}
          {data.advice && (
            <div className="mb-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
              <p className="font-medium">Your face shape looks <b>{data.advice.face_shape}</b>. Styles that suit you:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">{data.advice.styles.map((s, i) => <li key={i}><b>{s.name}</b> — {s.why}</li>)}</ul>
            </div>
          )}
          <details className="mb-3 text-xs text-slate-500"><summary className="cursor-pointer">How the AI understood this</summary><ul className="mt-1 list-disc pl-4">{data.trace?.map((t, i) => <li key={i} className="break-all">{t}</li>)}</ul></details>
          {data.results?.length === 0 && <p className="text-sm text-slate-500">No matching salons/slots. Try a broader query.</p>}
          <div className="space-y-3">
            {data.results?.map((r, i) => (
              <div key={i} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><Link href={`/s/${r.tenant.slug}`} className="font-semibold hover:text-brand-600">{r.tenant.name}</Link><p className="text-xs text-slate-500">{r.tenant.city} · match {Math.round(r.similarity * 100)}%</p></div>
                  <div className="text-right"><p className="font-medium">{r.service.name}</p><p className="text-sm">{r.deal ? <><s className="text-slate-400">₹{r.service.base_price}</s> <b className="text-brand-700">₹{r.price}</b></> : <>₹{r.price}</>} <span className="text-xs text-slate-400">+GST · {r.service.duration_min}m</span></p></div>
                </div>
                {r.deal && <p className="mt-1 text-xs text-pink-700">🔥 {r.deal.title}</p>}
                {r.slots.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.slots.map((s) => <Link key={s.time} href={`/s/${r.tenant.slug}?service=${r.service.id}&date=${data.date}&time=${s.time}`} className="rounded-lg border border-brand-500 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">{s.time} · ₹{s.price} · {s.staff}</Link>)}
                  </div>
                ) : data.date ? <p className="mt-2 text-xs text-slate-400">No free slots in that window.</p> : <Link href={`/s/${r.tenant.slug}?service=${r.service.id}`} className="mt-2 inline-block text-xs text-brand-600">See availability →</Link>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
