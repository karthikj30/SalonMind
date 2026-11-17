"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Mic, Search } from "lucide-react";
import { VOICE_ROUTES } from "@/lib/domain/voice";

const ACTIONS: { label: string; hint: string; say: string }[] = [
  { label: "New booking", hint: "Bookings", say: "open bookings" },
  { label: "Add client", hint: "Clients", say: "open clients" },
  { label: "Today's summary", hint: "Ask the assistant", say: "summary" },
  { label: "How many bookings today?", hint: "Ask the assistant", say: "how many bookings today?" },
  { label: "Dark mode", hint: "Appearance", say: "dark mode" },
  { label: "Light mode", hint: "Appearance", say: "light mode" },
];

/**
 * Ctrl/⌘ + K — jump to any page or run a quick action. Anything that isn't a page name is handed to the
 * Voice Agent as a typed command, so "add client name Meera phone 98…" works from the keyboard too.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sm-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("sm-palette", onOpen); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setIdx(0); window.setTimeout(() => input.current?.focus(), 30); } }, [open]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = VOICE_ROUTES.filter((r) => !s || r.title.toLowerCase().includes(s) || r.names.some((n) => n.toLowerCase().includes(s)))
      .map((r) => ({ key: r.path, label: r.title, hint: "Go to page", run: () => router.push(r.path) }));
    const acts = ACTIONS.filter((a) => !s || a.label.toLowerCase().includes(s))
      .map((a) => ({ key: a.label, label: a.label, hint: a.hint, run: () => window.dispatchEvent(new CustomEvent("sm-voice-command", { detail: a.say })) }));
    const ask = s ? [{ key: "ask", label: `Ask the assistant: “${q.trim()}”`, hint: "Voice Agent", run: () => window.dispatchEvent(new CustomEvent("sm-voice-command", { detail: q.trim() })) }] : [];
    return [...pages, ...acts, ...ask];
  }, [q, router]);
  useEffect(() => setIdx(0), [q]);

  if (!open) return null;
  const go = (i: number) => { const it = items[i]; if (!it) return; setOpen(false); it.run(); };
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-sm" aria-label="Close" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg animate-scale-in overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-lift">
        <label className="flex items-center gap-2.5 border-b border-brand-100 px-4 py-3">
          <Search className="h-4 w-4 text-brand-900/50" aria-hidden />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page, or tell the assistant what to do…" aria-label="Command" dir="auto"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(idx); }
            }}
            className="w-full bg-transparent text-sm text-brand-950 placeholder:text-brand-900/40 focus:outline-none" />
          <kbd className="hidden rounded border border-brand-100 px-1.5 py-0.5 text-[10px] text-brand-900/50 sm:block">Esc</kbd>
        </label>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === idx}>
              <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => go(i)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm ${i === idx ? "bg-brand-50 text-brand-950" : "text-brand-900/80"}`}>
                <span className="flex min-w-0 items-center gap-2">{it.key === "ask" && <Mic className="h-3.5 w-3.5 shrink-0 text-brand-600" />}<span className="truncate">{it.label}</span></span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-brand-900/45">{it.hint}{i === idx && <CornerDownLeft className="h-3 w-3" />}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-4 text-center text-sm text-brand-900/50">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}
