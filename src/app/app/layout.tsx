import Link from "next/link";
import { ExternalLink, LogOut, Plus, Smartphone } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { signOut, switchSalon } from "../auth-actions";
import { aiEnabled } from "@/lib/ai/llm";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { CommandPalette } from "@/components/CommandPalette";
import { UiTranslator } from "@/components/UiTranslator";
import { AppUpdateBanner } from "@/components/AppUpdateBanner";
import { LanguagePicker } from "@/components/LanguagePicker";
import { getDict } from "@/lib/i18n/server";
import { isRtl } from "@/lib/i18n/ui";
import { appDict } from "@/lib/i18n/app";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, salons, user } = await getTenantContext();
  const { lang } = await getDict(); // same language cookie as the consumer pages
  const footer = (
    <div className="space-y-2">
      {/* Two rows: the sidebar is narrow, and the language name plus the theme label do not fit beside the AI status */}
      <p className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${aiEnabled() ? "animate-pulse bg-emerald-400" : "bg-gold-400"}`} aria-hidden />
        {aiEnabled() ? "AI models connected" : "Rules mode · add AI key"}
      </p>
      <div className="-ml-2 flex flex-wrap items-center gap-1">
        <LanguagePicker value={lang} label="Language" reload className="text-onplum/80 hover:bg-white/10" />
        <ThemeToggle className="text-onplum/80 hover:bg-white/10" />
      </div>
      {salons.length > 1 && (
        <form action={switchSalon} className="flex gap-1">
          <select name="tenant_id" defaultValue={tenant.id} className="w-full rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-white [&>option]:text-ink">
            {salons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="rounded-lg border border-white/15 px-2 hover:bg-white/10">Go</button>
        </form>
      )}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Link href={`/s/${tenant.slug}`} target="_blank" className="inline-flex items-center gap-1 hover:text-champ-300"><ExternalLink className="h-3 w-3" />Public page</Link>
        <Link href="/onboarding" className="inline-flex items-center gap-1 hover:text-champ-300"><Plus className="h-3 w-3" />New salon</Link>
        <Link href="/download" className="inline-flex items-center gap-1 hover:text-champ-300"><Smartphone className="h-3 w-3" />Get the app</Link>
        <form action={signOut}><button className="inline-flex items-center gap-1 hover:text-champ-300" title={user.email ?? ""}><LogOut className="h-3 w-3" />Sign out</button></form>
      </div>
    </div>
  );
  return (
    <div data-i18n-root data-i18n-wait={lang !== "en" ? "" : undefined} lang={lang} dir={isRtl(lang) ? "rtl" : undefined} className="flex min-h-screen flex-col md:flex-row">
      <UiTranslator lang={lang} dict={appDict(lang)} />
      <Sidebar salon={tenant.name} footer={footer} />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1400px] animate-fade-in"><AppUpdateBanner />{children}</div>
      </main>
      <VoiceAssistant defaultLang={lang !== "en" ? lang : tenant.settings.default_language} />
      <CommandPalette />
    </div>
  );
}
