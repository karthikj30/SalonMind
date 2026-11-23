"use client";
import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install as an app" for Chrome / Edge on Windows, Mac, Linux and ChromeOS (no download, always up to date). */
export function InstallAppButton() {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setEv(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (installed) return <p className="text-sm font-medium text-emerald-700">Installed — open SalonMind from your apps.</p>;
  if (!ev) return <p className="text-xs text-brand-900/55">In Chrome or Edge, use the install icon in the address bar (or menu → “Install SalonMind”).</p>;
  return (
    <button type="button" onClick={async () => { await ev.prompt(); await ev.userChoice; setEv(null); }}
      className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-surface px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50">
      <MonitorDown className="h-4 w-4" />Install in one click
    </button>
  );
}
