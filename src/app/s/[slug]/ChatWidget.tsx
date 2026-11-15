"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

export function ChatWidget({ slug, salon }: { slug: string; salon: string }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [msgs, setMsgs] = useState<{ from: "me" | "ai"; text: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);
  useEffect(() => {
    try { setHandle(localStorage.getItem("sm_phone") ?? ""); } catch { /* ignore */ }
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !handle.trim()) return;
    try { localStorage.setItem("sm_phone", handle); } catch { /* ignore */ }
    const m = text;
    setMsgs((x) => [...x, { from: "me", text: m }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/marketplace/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, handle, message: m }) });
      const d = await r.json();
      setMsgs((x) => [...x, ...((d.replies ?? [d.error ?? "…"]) as string[]).map((t) => ({ from: "ai" as const, text: t }))]);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[min(370px,calc(100vw-2rem))]">
      {open ? (
        <div className="flex h-[480px] origin-bottom-right animate-scale-in flex-col overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-lift" role="dialog" aria-label={`Chat with ${salon}`}>
          <div className="flex items-center justify-between bg-plum-gradient px-4 py-3 text-white">
            <div><p className="text-sm font-semibold">{salon}</p><p className="text-[11px] text-brand-100/80">AI receptionist · any language · books for you</p></div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/10" aria-label="Close chat"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-ivory-50 p-3 text-sm" aria-live="polite">
            {!msgs.length && <p className="rounded-xl bg-surface p-3 text-xs text-brand-900/60 shadow-soft">Namaste! Ask about prices, free slots or book directly — e.g. “kal 6 baje haircut?”. I&apos;ll confirm before booking anything.</p>}
            {msgs.map((m, i) => <div key={i} className={`max-w-[85%] animate-scale-in whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.from === "me" ? "ml-auto rounded-br-md bg-rose-gold text-white" : "rounded-bl-md bg-surface text-brand-950 shadow-soft"}`}>{m.text}</div>)}
            {busy && <div className="flex w-16 gap-1 rounded-2xl bg-surface px-3 py-3 shadow-soft">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300" style={{ animationDelay: `${d * 120}ms` }} />)}</div>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="space-y-1.5 border-t border-brand-100 p-2">
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Your mobile (+91…)" inputMode="tel" aria-label="Your mobile number" className="w-full rounded-lg border border-brand-100 bg-ivory-50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-200" required />
            <div className="flex gap-1.5">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" className="flex-1 rounded-lg border border-brand-100 bg-ivory-50 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
              <button disabled={busy} className="grid w-10 place-items-center rounded-lg bg-rose-gold text-white disabled:opacity-50" aria-label="Send"><Send className="h-4 w-4" /></button>
            </div>
          </form>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="ml-auto flex animate-pulse-ring items-center gap-2 rounded-full bg-rose-gold px-5 py-3 text-sm font-medium text-white shadow-lift transition hover:brightness-110 active:scale-95"><MessageCircle className="h-4 w-4" />Chat & book</button>
      )}
    </div>
  );
}
