import Link from "next/link";
import { ArrowRight, Bot, CalendarClock, MessagesSquare, Package, Receipt, Search, Sparkles, UserRoundSearch, Workflow, Languages, IndianRupee, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SalonArt } from "@/components/SalonArt";

const MODULES = [
  [Package, "Procurement & inventory", "Predictive refills tuned to weddings and festivals, autonomous vendor negotiation, smart-scale waste tracking."],
  [MessagesSquare, "CRM & unified inbox", "One AI receptionist for WhatsApp, Instagram, Google and calls — in your client's language. Win-back offers at week 5."],
  [CalendarClock, "Matrix scheduling", "Skill × room × equipment × margin optimisation, Diwali surge pricing, no-show deposits via UPI."],
  [UserRoundSearch, "Recruitment & HR", "Job ads for Naukri, Apna & Instagram, resume screening, chat interviews, slab commissions with PF/ESI/PT."],
  [Search, "Consumer marketplace", "“Balayage under ₹3000 this evening” — natural-language, photo and face-shape search with live slots and deals."],
  [Receipt, "GST billing & POS", "UPI, card and wallet checkout, booth-renter split payouts, CGST/SGST/IGST invoices and GSTR drafts."],
] as const;

const FACTS = [[Bot, "16 AI agents", "working together"], [Languages, "10 Indian languages", "in every conversation"], [IndianRupee, "₹0 to run", "on free tiers"], [ShieldCheck, "DPDP-ready", "consent, export, erasure"]] as const;

export default function Home() {
  return (
    <main className="overflow-hidden">
      <section className="relative bg-plum-gradient text-white">
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-rose-500/25 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6">
          <nav className="mb-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5"><Logo className="h-9 w-9" /><span className="font-display text-xl font-semibold">SalonMind</span></Link>
            <div className="flex items-center gap-1 text-sm">
              <Link href="/marketplace" className="hidden rounded-xl px-3 py-2 text-brand-100 hover:bg-white/10 sm:inline">Find a salon</Link>
              <Link href="/login" className="rounded-xl px-3 py-2 text-brand-100 hover:bg-white/10">Log in</Link>
              <Link href="/signup" className="rounded-xl bg-gold-400 px-4 py-2 font-medium text-brand-950 hover:bg-gold-300">List your salon</Link>
            </div>
          </nav>
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-gold-300/40 bg-white/10 px-3 py-1 text-xs font-medium text-gold-200"><Sparkles className="h-3.5 w-3.5" />AI-native · multi-agent · made for India</p>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] sm:text-6xl">Your salon, run by a team of <em className="text-gold-300">AI agents</em>.</h1>
              <p className="mt-5 max-w-xl text-lg text-brand-100/85">From the first WhatsApp “kal shaam haircut?” to the GST return — SalonMind books, reminds, restocks, pays and markets for you, so your team can focus on the chair.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3 font-medium text-brand-950 shadow-lift hover:bg-gold-300">Start free <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 font-medium backdrop-blur hover:bg-white/20">Book a salon</Link>
              </div>
            </div>
            <SalonArt className="mx-auto w-full max-w-md drop-shadow-2xl" />
          </div>
        </div>
        <svg viewBox="0 0 1440 60" className="relative block w-full text-ivory-100" preserveAspectRatio="none" aria-hidden><path fill="currentColor" d="M0 60V20c240 30 480 40 720 20S1200 0 1440 20v40z" /></svg>
      </section>

      <section className="mx-auto -mt-2 max-w-6xl px-4">
        <div className="grid gap-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map(([Icon, a, b]) => (
            <div key={a} className="flex items-center gap-3 p-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-champagne text-gold-700"><Icon className="h-5 w-5" /></span>
              <div><p className="font-semibold text-brand-900">{a}</p><p className="text-xs text-brand-900/55">{b}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Everything a salon needs</p>
        <h2 className="mt-2 text-center font-display text-3xl font-semibold text-brand-900 sm:text-4xl">Six modules. One brain.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(([Icon, title, body]) => (
            <div key={title} className="group rounded-2xl border border-brand-100 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-gold text-white shadow-soft"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-4 font-display text-lg font-semibold text-brand-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-900/65">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-champagne/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex items-center gap-2 text-gold-700"><Workflow className="h-5 w-5" /><p className="text-xs font-semibold uppercase tracking-[0.2em]">How the agents work together</p></div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[["1", "A client messages", "“Kal 6 baje facial?” arrives on WhatsApp."], ["2", "Concierge proposes", "Checks live slots & price, asks the client to reply YES."], ["3", "Agents react", "No-show risk, UPI deposit, stock forecast, reminder — automatically."], ["4", "You stay in control", "Every action is logged in the Agent Console; complaints come to you."]].map(([n, t, d]) => (
              <div key={n} className="rounded-2xl bg-white/80 p-5 shadow-soft">
                <span className="font-display text-3xl font-semibold text-rose-500">{n}</span>
                <p className="mt-2 font-semibold text-brand-900">{t}</p><p className="mt-1 text-sm text-brand-900/65">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-10 text-xs text-brand-900/50">
        <span className="flex items-center gap-2"><Logo className="h-6 w-6" />SalonMind · built for Indian salons</span>
        <span>Runs on free tiers: Vercel · Supabase · Groq / Gemini / OpenRouter free models</span>
      </footer>
    </main>
  );
}
