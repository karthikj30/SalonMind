"use client";
import { useEffect, useState } from "react";
import { Globe, Monitor, Smartphone, X } from "lucide-react";
import { APK_PATH, SHELL_COOKIE } from "@/lib/domain/apps";
import { Logo } from "./Logo";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "sm_app_choice";

/**
 * First visit to the deployed site (Vercel or Render): choose the Android app, the desktop app, or carry on in the
 * browser. Never shown inside the apps themselves, in an installed web app, or again once a choice was made.
 */
export function GetAppChooser() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | "desktop">("desktop");
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const inShell = document.cookie.includes(`${SHELL_COOKIE}=`) || "salonmindApp" in window
      || window.matchMedia("(display-mode: standalone)").matches || document.referrer.startsWith("android-app://");
    let chosen: string | null = null;
    try { chosen = localStorage.getItem(KEY); } catch { /* storage blocked: still offer once */ }
    const ua = navigator.userAgent;
    setPlatform(/Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "desktop");
    // bots and link previews never see it; real visitors get it after the page has painted
    if (!inShell && !chosen && !/bot|crawler|spider|preview/i.test(ua)) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onPrompt); };
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const choose = (c: string) => { try { localStorage.setItem(KEY, c); } catch { /* ignore */ } setOpen(false); };
  if (!open) return null;

  const android = (
    <a key="android" href={APK_PATH} download onClick={() => choose("android")} data-choice="android"
      className={`group flex items-start gap-3 rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 hover:shadow-soft ${platform === "android" ? "border-brand-400 bg-brand-50/60" : "border-brand-100 bg-surface"}`}>
      <Smartphone className="mt-0.5 h-6 w-6 shrink-0 text-rose-gold" aria-hidden />
      <span className="min-w-0">
        <span className="block font-semibold text-brand-900">Android app</span>
        <span className="block text-xs text-brand-900/60">Download the APK (about 1 MB). Updates itself — no reinstalling.</span>
      </span>
    </a>
  );
  const desktop = (
    <div key="desktop" data-choice="desktop" className={`flex items-start gap-3 rounded-2xl border p-4 ${platform === "desktop" ? "border-brand-400 bg-brand-50/60" : "border-brand-100 bg-surface"}`}>
      <Monitor className="mt-0.5 h-6 w-6 shrink-0 text-rose-gold" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-brand-900">Desktop app</span>
        <span className="block text-xs text-brand-900/60">Windows, Mac and Linux — its own window and icon, always up to date.</span>
        <span className="mt-2 flex flex-wrap gap-2">
          {install && (
            <button type="button" onClick={async () => { await install.prompt(); await install.userChoice; choose("desktop"); }}
              className="rounded-xl bg-rose-gold px-3 py-1.5 text-xs font-medium text-white shadow-soft">Install on this computer</button>
          )}
          <a href="/download" onClick={() => choose("desktop")} className="rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-50">Desktop downloads</a>
        </span>
      </span>
    </div>
  );
  const web = (
    <button key="web" type="button" onClick={() => choose("web")} data-choice="web"
      className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-surface p-4 text-start transition hover:-translate-y-0.5 hover:shadow-soft">
      <Globe className="mt-0.5 h-6 w-6 shrink-0 text-rose-gold" aria-hidden />
      <span className="min-w-0">
        <span className="block font-semibold text-brand-900">Continue on the web</span>
        <span className="block text-xs text-brand-900/60">{platform === "ios" ? "On iPhone: Share → Add to Home Screen to keep it one tap away." : "Nothing to install — works in any browser."}</span>
      </span>
    </button>
  );
  const order = platform === "android" ? [android, desktop, web] : platform === "ios" ? [web, desktop] : [desktop, android, web];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="get-app-title" data-get-app
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) choose("web"); }}>
      <div className="w-full max-w-md animate-scale-in rounded-3xl border border-brand-100 bg-ivory-50 p-5 shadow-lift">
        <div className="mb-4 flex items-start gap-3">
          <Logo className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id="get-app-title" className="font-display text-xl font-semibold text-brand-900">How would you like to use SalonMind?</h2>
            <p className="text-xs text-brand-900/60">The apps open your live salon, so new features arrive automatically.</p>
          </div>
          <button type="button" onClick={() => choose("web")} aria-label="Close" className="rounded-lg p-1 text-brand-900/50 hover:bg-brand-50"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-2.5">{order}</div>
      </div>
    </div>
  );
}
