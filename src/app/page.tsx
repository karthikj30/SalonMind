import Link from "next/link";
import { GetAppChooser } from "@/components/GetAppChooser";
import { ArrowRight, Bot, CalendarClock, MessagesSquare, Package, Receipt, Search, Sparkles, UserRoundSearch, Workflow, Languages, IndianRupee, ShieldCheck, Menu, Store, Smartphone, LogIn, Mic, Ticket, Gift, FlaskConical, TrendingUp } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SalonArt } from "@/components/SalonArt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguagePicker } from "@/components/LanguagePicker";
import { UiTranslator } from "@/components/UiTranslator";
import { getDict } from "@/lib/i18n/server";
import { isRtl } from "@/lib/i18n/ui";
import { appDict } from "@/lib/i18n/app";
import { landingDict } from "@/lib/i18n/landing";
import { Reveal } from "@/components/Reveal";

const MODULES = [
  [Package, "Procurement & inventory", "Predictive refills tuned to weddings and festivals, autonomous vendor negotiation, smart-scale waste tracking."],
  [MessagesSquare, "CRM & unified inbox", "One AI receptionist for WhatsApp, Instagram, Google and calls — in your client's language. Win-back offers at week 5."],
  [CalendarClock, "Matrix scheduling", "Skill × room × equipment × margin optimisation, Diwali surge pricing, no-show deposits via UPI."],
  [UserRoundSearch, "Recruitment & HR", "Job ads for Naukri, Apna & Instagram, resume screening, chat interviews, slab commissions with PF/ESI/PT."],
  [Search, "Consumer marketplace", "“Balayage under ₹3000 this evening” — natural-language, photo and face-shape search with live slots and deals."],
  [Receipt, "GST billing & POS", "UPI, card and wallet checkout, booth-renter split payouts, CGST/SGST/IGST invoices and GSTR drafts."],
] as const;

const EXTRAS = [
  [Mic, "Voice agent", "Say “open bookings” or “add client Meera” in Hindi, Tamil or 11 more languages — Groq Whisper or on-device speech."],
  [Ticket, "Walk-in token queue", "QR self check-in, live wait times from the stylists' real calendar, and a WhatsApp ping when the turn is near."],
  [Gift, "Gift cards & packages", "Vouchers sold without GST and redeemed after tax, prepaid session packages, and reminders before they expire."],
  [FlaskConical, "Colour safety", "Formula cards and patch tests per client; the Safety Agent asks for a test 48 hours before every colour service."],
  [TrendingUp, "Real profit & payroll", "Clock-in attendance feeds payroll, the expense book feeds a monthly profit & loss next to the GST drafts."],
  [Smartphone, "Android & desktop apps", "One-tap APK and desktop apps that open the live salon — new features arrive without reinstalling."],
] as const;

const FACTS = [[Bot, "22 AI agents", "working together"], [Languages, "13 languages", "12 Indian + English, Urdu right-to-left"], [IndianRupee, "₹0 to run", "on free tiers"], [ShieldCheck, "DPDP-ready", "consent, export, erasure"]] as const;

export default async function Home() {
  const { lang } = await getDict();
  return (
    <main data-i18n-root data-i18n-wait={lang !== "en" ? "" : undefined} lang={lang} dir={isRtl(lang) ? "rtl" : undefined} className="overflow-hidden">
      <UiTranslator lang={lang} dict={{ ...appDict(lang), ...landingDict(lang) }} />
      <section className="relative bg-plum-gradient text-white">
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-rose-500/25 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6">
          <nav className="mb-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5"><Logo className="h-9 w-9" /><span className="font-display text-xl font-semibold">SalonMind</span></Link>
            <div className="hidden items-center gap-1 text-sm md:flex">
              <Link href="/marketplace" className="rounded-xl px-3 py-2 text-onplum hover:bg-white/10">Find a salon</Link>
              <Link href="/download" className="rounded-xl px-3 py-2 text-onplum hover:bg-white/10">Get the app</Link>
              <LanguagePicker value={lang} label="Language" reload className="px-3 py-2 text-onplum hover:bg-white/10" />
              <ThemeToggle className="px-3 py-2 text-onplum" />
              <Link href="/login" className="rounded-xl px-3 py-2 text-onplum hover:bg-white/10">Log in</Link>
              <Link href="/signup" className="rounded-xl bg-champ-400 px-4 py-2 font-medium text-ink hover:bg-champ-300">List your salon</Link>
            </div>
            {/* phones and small tablets: the same links in a menu (native <details>, works before JavaScript loads) */}
            <div className="flex items-center gap-1.5 md:hidden">
              <Link href="/signup" className="rounded-xl bg-champ-400 px-3 py-2 text-sm font-medium text-ink hover:bg-champ-300">List your salon</Link>
              <details className="group relative" data-mobile-nav>
                <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl border border-white/25 bg-white/10 text-onplum [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></summary>
                <nav className="absolute right-0 z-30 mt-2 w-60 animate-scale-in overflow-hidden rounded-2xl border border-brand-100 bg-ivory-50 p-1.5 text-sm text-brand-900 shadow-lift" aria-label="Main">
                  <Link href="/marketplace" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-brand-50"><Store className="h-4 w-4 text-rose-gold" />Find a salon</Link>
                  <Link href="/download" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-brand-50"><Smartphone className="h-4 w-4 text-rose-gold" />Get the app</Link>
                  <Link href="/login" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-brand-50"><LogIn className="h-4 w-4 text-rose-gold" />Log in</Link>
                  <div className="mt-1 flex items-center justify-between border-t border-brand-100 px-3 pt-2 text-xs text-brand-900/60">Language<LanguagePicker value={lang} label="Language" reload className="text-brand-800" /></div>
                  <div className="flex items-center justify-between px-3 pt-1 text-xs text-brand-900/60">Theme<ThemeToggle className="text-brand-800" /></div>
                </nav>
              </details>
            </div>
          </nav>
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-champ-300/40 bg-white/10 px-3 py-1 text-xs font-medium text-champ-200"><Sparkles className="h-3.5 w-3.5" />AI-native · multi-agent · made for India</p>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] sm:text-6xl">Your salon, run by a team of <em className="text-shimmer">AI agents</em>.</h1>
              <p className="mt-5 max-w-xl text-lg text-onplum/85">From the first WhatsApp “kal shaam haircut?” to the GST return — SalonMind books, reminds, restocks, pays and markets for you, so your team can focus on the chair.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="group inline-flex items-center gap-2 rounded-xl bg-champ-400 px-5 py-3 transition hover:shadow-glow active:scale-[.97] font-medium text-ink shadow-lift hover:bg-champ-300">Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 font-medium backdrop-blur hover:bg-white/20">Book a salon</Link>
              </div>
            </div>
            <SalonArt className="mx-auto w-full max-w-md animate-float drop-shadow-2xl" />
          </div>
        </div>
        <svg viewBox="0 0 1440 60" className="relative block w-full text-ivory-100" preserveAspectRatio="none" aria-hidden><path fill="currentColor" d="M0 60V20c240 30 480 40 720 20S1200 0 1440 20v40z" /></svg>
      </section>

      <section className="mx-auto -mt-2 max-w-6xl px-4">
        <div className="stagger grid gap-3 rounded-2xl border border-brand-100 bg-surface p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map(([Icon, a, b]) => (
            <div key={a} className="flex items-center gap-3 p-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-champagne text-gold-700"><Icon className="h-5 w-5" /></span>
              <div><p className="font-semibold text-brand-900">{a}</p><p className="text-xs text-brand-900/55">{b}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Everything a salon needs</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold text-brand-900 sm:text-4xl">Six modules. One brain.</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={i * 80}><div className="group lift h-full rounded-2xl border border-brand-100 bg-surface p-6 shadow-soft">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-gold text-white shadow-soft transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-4 font-display text-lg font-semibold text-brand-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-900/65">{body}</p>
            </div></Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Beyond the brief</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold text-brand-900 sm:text-4xl">Built for how Indian salons really work</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-extras>
          {EXTRAS.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={i * 80}><div className="lift flex h-full gap-4 rounded-2xl border border-brand-100 bg-surface p-5 shadow-soft">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-champagne text-gold-700"><Icon className="h-5 w-5" /></span>
              <div><h3 className="font-semibold text-brand-900">{title}</h3><p className="mt-1 text-sm leading-relaxed text-brand-900/65">{body}</p></div>
            </div></Reveal>
          ))}
        </div>
      </section>

      <section className="bg-champagne/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex items-center gap-2 text-gold-700"><Workflow className="h-5 w-5" /><p className="text-xs font-semibold uppercase tracking-[0.2em]">How the agents work together</p></div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[["1", "A client messages", "“Kal 6 baje facial?” arrives on WhatsApp."], ["2", "Concierge proposes", "Checks live slots & price, asks the client to reply YES."], ["3", "Agents react", "No-show risk, UPI deposit, stock forecast, reminder — automatically."], ["4", "You stay in control", "Every action is logged in the Agent Console; complaints come to you."]].map(([n, t, d], i) => (
              <Reveal key={n} delay={i * 120}><div className="lift h-full rounded-2xl bg-surface/80 p-5 shadow-soft">
                <span className="font-display text-3xl font-semibold text-rose-500">{n}</span>
                <p className="mt-2 font-semibold text-brand-900">{t}</p><p className="mt-1 text-sm text-brand-900/65">{d}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-10 text-xs text-brand-900/50">
        <span className="flex items-center gap-2"><Logo className="h-6 w-6" />SalonMind · built for Indian salons</span>
        <span className="flex flex-wrap gap-x-3"><Link href="/download" className="hover:text-brand-700">Android & desktop apps</Link><Link href="/marketplace" className="hover:text-brand-700">Find a salon</Link><span>Runs on free tiers: Vercel · Render · Supabase · Groq</span></span>
      </footer>
      <GetAppChooser />
    </main>
  );
}
