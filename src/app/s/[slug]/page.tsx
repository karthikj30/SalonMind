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

export const dynamic = "force-dynamic";

export default async function SalonPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
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
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/marketplace" className="text-sm text-brand-700">← Marketplace</Link>
      <h1 className="mt-3 text-2xl font-bold">{tenant.name}</h1>
      <p className="text-sm text-slate-500">{tenant.address} {tenant.city} · open {tenant.open_time.slice(0, 5)}–{tenant.close_time.slice(0, 5)}</p>
      {tenant.description && <p className="mt-2 text-sm text-slate-600">{tenant.description}</p>}
      {sp.error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</p>}
      {booked && (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-800">✅ Booked: {booked.services?.name} with {booked.staff?.name} on {fmtDateTime(booked.start_at)} — {inr(booked.price)} + GST</p>
          {Number(booked.deposit_required) > 0 ? <p className="mt-1 text-amber-800">To hold this slot, please pay a deposit of {inr(booked.deposit_required)} via UPI (the salon has sent details on WhatsApp).</p> : <p className="mt-1 text-emerald-700">A confirmation will be sent to you on WhatsApp.</p>}
          {payQr && (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="h-[180px] w-[180px] rounded bg-white" dangerouslySetInnerHTML={{ __html: payQr.svg }} />
              <div className="text-xs text-slate-600"><p>Scan with any UPI app, or on your phone:</p><a href={payQr.link} className="mt-1 inline-block rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white">Pay {inr(booked.deposit_required)} via UPI</a></div>
            </div>
          )}
        </div>
      )}
      {(deals ?? []).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">{deals!.map((d, i) => <span key={i} className="rounded-full bg-pink-100 px-3 py-1 text-xs text-pink-800">🔥 {d.title}</span>)}</div>
      )}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Services</h2>
          <ul className="divide-y rounded-xl border bg-white">
            {(services ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div><p className="font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.category} · {s.duration_min} min</p></div>
                <div className="text-right"><p>{inr(s.base_price)}</p><Link href={`?service=${s.id}&date=${date}`} className="text-xs text-brand-600">Pick →</Link></div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Book</h2>
          <form className="mb-3 flex gap-2 text-sm">
            <select name="service" defaultValue={serviceId} className="flex-1 rounded-lg border px-2 py-1.5">{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <input type="date" name="date" defaultValue={date} min={todayIst()} className="rounded-lg border px-2 py-1.5" />
            <button className="rounded-lg border px-3">Check</button>
          </form>
          {slots.length ? (
            <form action={marketplaceBook} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="service_id" value={serviceId} /><input type="hidden" name="date" value={date} />
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => {
                  const tm = toIst(s.start).time;
                  return (
                    <label key={tm} className="cursor-pointer">
                      <input type="radio" name="time" value={tm} defaultChecked={sp.time === tm} required className="peer hidden" />
                      <span className="block rounded-lg border px-2 py-1 text-xs peer-checked:border-brand-600 peer-checked:bg-brand-50">{tm} · {inr(s.quote.price)}</span>
                    </label>
                  );
                })}
              </div>
              <input name="name" required placeholder="Your name" className="w-full rounded-lg border px-2 py-1.5" />
              <input name="phone" required placeholder="Mobile (WhatsApp)" className="w-full rounded-lg border px-2 py-1.5" />
              <select name="language" className="w-full rounded-lg border px-2 py-1.5">{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" name="consent" defaultChecked /> Send me offers on WhatsApp (you can opt out anytime)</label>
              <SubmitButton className="w-full">Confirm booking</SubmitButton>
              <p className="text-[11px] text-slate-400">Prices are dynamic (demand-based) and exclude 18% GST.</p>
            </form>
          ) : <p className="rounded-xl border bg-white p-4 text-sm text-slate-500">No free slots on {date}. Try another date.</p>}
        </section>
      </div>
      <ChatWidget slug={slug} salon={tenant.name} />
    </main>
  );
}
