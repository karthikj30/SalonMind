"use client";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LANG_COOKIE, UI_LANGS } from "@/lib/i18n/ui";

/** Consumer-page language switch; remembered in a cookie so server-rendered pages come back translated. */
export function LanguagePicker({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const router = useRouter();
  return (
    <label className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${className}`}>
      <Languages className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => { document.cookie = `${LANG_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}
        className="cursor-pointer bg-transparent focus:outline-none [&>option]:text-ink"
      >
        {UI_LANGS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
    </label>
  );
}
