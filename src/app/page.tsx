import Link from "next/link";

const MODULES = [
  ["🧪", "Procurement & Inventory", "Predictive refills with festival demand, autonomous vendor negotiation, smart-scale waste tracking."],
  ["💬", "CRM & Unified Inbox", "Cycle-based WhatsApp offers, churn prediction from sentiment, one AI rep for WhatsApp/Instagram/Google/calls."],
  ["🗓️", "Matrix Scheduling", "Skill × room × equipment × margin optimisation, Diwali surge pricing, no-show deposits."],
  ["👩‍🎨", "Recruitment & HR", "AI job ads for Naukri/Apna/Instagram, resume screening, chat interviews, slab-commission payroll."],
  ["🔎", "Consumer Marketplace", "“Balayage under ₹3000 this evening” — intent + vector + photo search across salons, live deals."],
  ["🧾", "GST Billing & POS", "UPI/card split payouts, CGST/SGST/IGST e-invoices, ITC reconciliation, GSTR-1/3B drafts."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <nav className="mb-12 flex items-center justify-between">
        <span className="text-lg font-bold text-brand-700">✂️ SalonMind</span>
        <div className="flex gap-2 text-sm">
          <Link href="/marketplace" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">Find a salon</Link>
          <Link href="/login" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">Log in</Link>
          <Link href="/signup" className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">List your salon</Link>
        </div>
      </nav>
      <section className="mb-14 text-center">
        <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">AI-native · multi-agent · built for India</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Your salon, run by a team of AI agents.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">SalonMind is a multi-tenant ERP + marketplace where specialised agents — procurement, scheduling, CRM, recruitment, payroll, GST — coordinate over an event bus to run day-to-day operations with minimal manual work.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/signup" className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">Start free</Link>
          <Link href="/marketplace" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Explore marketplace</Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map(([icon, title, body]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-2xl">{icon}</div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </section>
      <p className="mt-12 text-center text-xs text-slate-400">Runs entirely on free tiers: Vercel · Supabase (Postgres + pgvector) · Groq / Gemini / OpenRouter free models.</p>
    </main>
  );
}
