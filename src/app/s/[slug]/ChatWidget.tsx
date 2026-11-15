"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, MessageCircle, SendHorizontal, X } from "lucide-react";

type ChatText = { chatBtn: string; chatSub: string; chatIntro: string; mobilePh: string; msgPh: string; online: string; typing: string; openWa: string };
type Msg = { from: "me" | "ai"; text: string; at: string };

const now = () => new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** WhatsApp-style chat with the salon's AI receptionist (same look as the owner's unified inbox). */
export function ChatWidget({ slug, salon, t, phone, rtl = false }: { slug: string; salon: string; t: ChatText; phone?: string | null; rtl?: boolean }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  useEffect(() => {
    try { setHandle(localStorage.getItem("sm_phone") ?? ""); } catch { /* storage blocked */ }
  }, []);
  const wa = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !handle.trim()) return;
    try { localStorage.setItem("sm_phone", handle); } catch { /* storage blocked */ }
    const m = text;
    setMsgs((x) => [...x, { from: "me", text: m, at: now() }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/marketplace/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, handle, message: m }) });
      const d = await r.json().catch(() => ({}));
      setMsgs((x) => [...x, ...((d.replies ?? [d.error ?? "…"]) as string[]).map((text) => ({ from: "ai" as const, text, at: now() }))]);
    } catch {
      setMsgs((x) => [...x, { from: "ai", text: "…", at: now() }]);
    } finally { setBusy(false); }
  }

  return (
    <div className={`fixed bottom-3 z-30 w-[min(380px,calc(100vw-1.5rem))] ${rtl ? "left-3" : "right-3"} sm:bottom-4`} dir={rtl ? "rtl" : "ltr"}>
      {open ? (
        <div className="flex h-[min(540px,calc(100dvh-5rem))] origin-bottom animate-scale-in flex-col overflow-hidden rounded-2xl border border-[var(--wa-line)] bg-[var(--wa-in)] shadow-lift" role="dialog" aria-label={`Chat with ${salon}`}>
          <div className="flex items-center gap-2.5 bg-[var(--wa-head)] px-3 py-2.5 text-white">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-semibold">{salon.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{salon}</p>
              <p className="truncate text-[11px] text-white/80">{busy ? t.typing : `${t.online} · ${t.chatSub}`}</p>
            </div>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium hover:bg-white/25" title={t.openWa}>WhatsApp ↗</a>}
            <button onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Close chat"><X className="h-4 w-4" /></button>
          </div>
          <div className="wa-wall flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3 text-sm" aria-live="polite">
            <p className="mx-auto mb-1 max-w-[92%] rounded-lg bg-[var(--wa-note)] px-3 py-1.5 text-center text-[11.5px] leading-snug text-[var(--wa-note-text)] shadow-sm" dir="auto">{t.chatIntro}</p>
            {msgs.map((m, i) => {
              const tail = i === 0 || msgs[i - 1].from !== m.from;
              return (
                <div key={i} className={`wa-bubble animate-scale-in ${m.from === "me" ? "wa-out self-end" : "wa-in self-start"} ${tail ? "wa-tail mt-1" : ""}`}>
                  <p className="whitespace-pre-wrap text-[14px] leading-snug" dir="auto">{m.text}</p>
                  <p className="wa-meta mt-0.5 flex items-center justify-end gap-1 text-[10.5px]" dir="ltr">{m.at}{m.from === "me" && <CheckCheck className="h-3.5 w-3.5 text-[var(--wa-tick)]" />}</p>
                </div>
              );
            })}
            {busy && <div className="wa-bubble wa-in wa-tail mt-1 flex w-16 gap-1 self-start py-3">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--wa-meta)]" style={{ animationDelay: `${d * 120}ms` }} />)}</div>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="space-y-1.5 bg-[var(--wa-panel)] p-2">
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t.mobilePh} inputMode="tel" autoComplete="tel" aria-label="Your mobile number" dir="ltr" className="w-full rounded-full bg-[var(--wa-in)] px-3.5 py-1.5 text-xs text-[var(--wa-text)] placeholder:text-[var(--wa-meta)] focus:outline-none focus:ring-2 focus:ring-[#00a88466]" required />
            <div className="flex items-end gap-1.5">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.msgPh} aria-label="Message" dir="auto" className="min-w-0 flex-1 rounded-full bg-[var(--wa-in)] px-4 py-2.5 text-[15px] text-[var(--wa-text)] placeholder:text-[var(--wa-meta)] focus:outline-none focus:ring-2 focus:ring-[#00a88466]" />
              <button disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--wa-send)] text-white shadow transition hover:brightness-110 active:scale-95 disabled:opacity-50" aria-label="Send"><SendHorizontal className={`h-5 w-5 ${rtl ? "rotate-180" : ""}`} /></button>
            </div>
          </form>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className={`flex animate-pulse-ring items-center gap-2 rounded-full bg-[var(--wa-send)] px-5 py-3 text-sm font-medium text-white shadow-lift transition hover:brightness-110 active:scale-95 ${rtl ? "mr-auto" : "ml-auto"}`}><MessageCircle className="h-4 w-4" />{t.chatBtn}</button>
      )}
    </div>
  );
}
