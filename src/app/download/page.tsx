import Link from "next/link";
import { headers } from "next/headers";
import { Apple, CheckCircle2, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UiTranslator } from "@/components/UiTranslator";
import { LanguagePicker } from "@/components/LanguagePicker";
import { InstallAppButton } from "@/components/InstallAppButton";
import { getDict } from "@/lib/i18n/server";
import { isRtl } from "@/lib/i18n/ui";
import { appDict } from "@/lib/i18n/app";
import { qrSvg } from "@/lib/services/qr";
import { APK_PATH, DESKTOP_RELEASES } from "@/lib/domain/apps";
import versions from "../../../apps/version.json";

export const metadata = { title: "Get the app" };

/** Download page for the Android app, the desktop app and the one-click installed web app. */
export default async function DownloadPage() {
  const { lang } = await getDict();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const apkUrl = `${base}${APK_PATH}`;
  const qr = await qrSvg(apkUrl, 170);
  const card = "rounded-2xl border border-brand-100 bg-surface p-6 shadow-soft";
  return (
    <main data-i18n-root data-i18n-wait={lang !== "en" ? "" : undefined} lang={lang} dir={isRtl(lang) ? "rtl" : undefined} className="min-h-screen bg-ivory-100 pb-16">
      <UiTranslator lang={lang} dict={appDict(lang)} />
      <header className="relative bg-plum-gradient text-white">
        <div className="salon-pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5">
          <Link href="/" className="flex items-center gap-2.5"><Logo className="h-9 w-9" /><span className="font-display text-xl font-semibold">SalonMind</span></Link>
          <LanguagePicker value={lang} label="Language" className="text-white/90" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-4">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Get the SalonMind app</h1>
          <p className="mt-2 max-w-2xl text-sm text-onplum/85">For the reception desk, the owner&apos;s phone and every stylist. The apps open your live salon, so new features arrive by themselves — you never reinstall.</p>
        </div>
      </header>
      <div className="mx-auto -mt-6 grid max-w-5xl gap-4 px-4 md:grid-cols-2">
        <section className={card} data-download="android">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-brand-900"><Smartphone className="h-5 w-5 text-rose-gold" />Android</h2>
          <p className="mt-1 text-sm text-brand-900/65">Android 7.0 or newer · about 1 MB · version {versions.android.versionName}</p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <div className="h-[170px] w-[170px] shrink-0 rounded-xl bg-[#fff] p-1 shadow-soft" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code to download the Android app" />
            <div className="min-w-0 space-y-2 text-sm">
              <a href={APK_PATH} download className="inline-flex items-center gap-2 rounded-xl bg-rose-gold px-4 py-2.5 font-medium text-white shadow-soft">Download for Android</a>
              <p className="text-xs text-brand-900/55">Scan the code with the phone camera, or open this page on the phone.</p>
            </div>
          </div>
          <ol className="mt-4 list-decimal space-y-1 ps-5 text-xs text-brand-900/65">
            <li>Open the downloaded file and allow “Install unknown apps” for your browser when Android asks.</li>
            <li>Tap Install, then open SalonMind and sign in once.</li>
          </ol>
        </section>
        <section className={card} data-download="desktop">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-brand-900"><Monitor className="h-5 w-5 text-rose-gold" />Windows, Mac & Linux</h2>
          <p className="mt-1 text-sm text-brand-900/65">Quickest: install straight from the browser — nothing to download.</p>
          <div className="mt-3"><InstallAppButton /></div>
          <div className="mt-5 border-t border-brand-100 pt-4">
            <p className="text-sm text-brand-900/70">Prefer a desktop installer? Version {versions.desktop.version} for Windows (.exe), Mac (.dmg) and Linux (.AppImage / .deb):</p>
            <a href={DESKTOP_RELEASES} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"><Apple className="h-4 w-4" />Desktop installers</a>
            <p className="mt-2 text-xs text-brand-900/50">The installers are on the project&apos;s GitHub releases page (sign in to GitHub to download).</p>
          </div>
        </section>
        <section className={`${card} md:col-span-2`}>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-brand-900"><RefreshCw className="h-5 w-5 text-rose-gold" />How updates work</h2>
          <ul className="mt-3 grid gap-2 text-sm text-brand-900/75 sm:grid-cols-3">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Every new feature and fix appears the next time you open the app — automatically, no reinstall.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />If the app itself ever changes, a banner offers “Update app”; it installs over the old one and keeps your sign-in.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Microphone (voice commands), WhatsApp links and UPI payments work just like in the browser.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
