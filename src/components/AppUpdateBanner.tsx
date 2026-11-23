"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { APK_PATH, SHELL_COOKIE, parseShell, shellUpdate, type AppVersions } from "@/lib/domain/apps";

/**
 * Shown only inside the Android / desktop app when a newer app shell exists. The site itself is always current;
 * this covers the rare shell update. On Android the new APK installs over the old one (same signing key), keeping
 * the sign-in and settings — no uninstall.
 */
export function AppUpdateBanner() {
  const [upd, setUpd] = useState<ReturnType<typeof shellUpdate>>(null);
  const [desktopUrl, setDesktopUrl] = useState("/download");
  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${SHELL_COOKIE}=`))?.split("=")[1];
    const shell = parseShell(raw ? decodeURIComponent(raw) : null);
    if (!shell || shell.kind === "pwa") return;
    const key = `sm_update_dismissed_${shell.kind}`;
    fetch("/api/app-version", { cache: "no-store" }).then((r) => r.json()).then((v: AppVersions & { downloads: { desktop: string } }) => {
      const u = shellUpdate(shell, v);
      let dismissed = "";
      try { dismissed = sessionStorage.getItem(key) ?? ""; } catch { /* storage blocked */ }
      if (u && dismissed !== u.latest) { setUpd(u); setDesktopUrl(v.downloads.desktop); }
    }).catch(() => {});
  }, []);
  if (!upd) return null;
  const dismiss = () => { try { sessionStorage.setItem(`sm_update_dismissed_${upd.kind}`, upd.latest); } catch { /* ignore */ } setUpd(null); };
  return (
    <div role="status" data-app-update className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-brand-900 shadow-soft">
      <Download className="h-4 w-4 shrink-0 text-gold-700" aria-hidden />
      <p className="min-w-0 flex-1">A new version of the SalonMind app is ready ({upd.latest}). It installs over this one — your sign-in and data stay.</p>
      <a href={upd.kind === "android" ? APK_PATH : desktopUrl} className="rounded-xl bg-rose-gold px-3.5 py-1.5 font-medium text-white shadow-soft" {...(upd.kind === "desktop" ? { target: "_blank", rel: "noreferrer" } : {})}>Update app</a>
      <button type="button" onClick={dismiss} aria-label="Later" className="rounded-lg p-1 text-brand-900/50 hover:bg-gold-100"><X className="h-4 w-4" /></button>
    </div>
  );
}
