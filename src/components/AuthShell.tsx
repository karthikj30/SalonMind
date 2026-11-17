import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "./Logo";
import { SalonArt } from "./SalonArt";
import { ThemeToggle } from "./ThemeToggle";
import { VoiceAssistant } from "./VoiceAssistant";
import { UiTranslator } from "./UiTranslator";
import { LanguagePicker } from "./LanguagePicker";
import { getDict } from "@/lib/i18n/server";
import { isRtl } from "@/lib/i18n/ui";
import { appDict } from "@/lib/i18n/app";

export async function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { lang } = await getDict();
  return (
    <main data-i18n-root data-i18n-wait={lang !== "en" ? "" : undefined} lang={lang} dir={isRtl(lang) ? "rtl" : undefined} className="grid min-h-screen lg:grid-cols-2">
      <UiTranslator lang={lang} dict={appDict(lang)} />
      <section className="relative hidden overflow-hidden bg-plum-gradient p-12 text-white lg:flex lg:flex-col">
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2.5"><Logo className="h-10 w-10" /><span className="font-display text-2xl font-semibold">SalonMind</span></Link>
        <div className="relative my-auto">
          <SalonArt className="mb-8 w-72 animate-float" />
          <h2 className="font-display text-3xl font-semibold leading-tight">The calm, beautifully-run salon<br />you always wanted.</h2>
          <ul className="mt-6 space-y-2 text-sm text-onplum/85">
            {["AI receptionist on WhatsApp, Instagram & calls", "Smart calendar with no double-bookings", "GST invoices, UPI deposits & payroll done for you"].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-champ-300" />{t}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="relative flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="absolute right-4 top-4 flex items-center gap-1 rtl:left-4 rtl:right-auto">
          <LanguagePicker value={lang} label="Language" reload className="text-brand-700 hover:bg-brand-50" />
          <ThemeToggle className="text-brand-700 hover:!bg-brand-50" />
        </div>
        <div className="mx-auto w-full max-w-md animate-fade-up">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden"><Logo className="h-9 w-9" /><span className="font-display text-xl font-semibold text-brand-900">SalonMind</span></Link>
          <h1 className="font-display text-3xl font-semibold text-brand-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-brand-900/60">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
      <VoiceAssistant defaultLang={lang} />
    </main>
  );
}
