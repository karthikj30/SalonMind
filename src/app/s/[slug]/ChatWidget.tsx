"use client";
import { useEffect, useState } from "react";

export function ChatWidget({ slug, salon }: { slug: string; salon: string }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [msgs, setMsgs] = useState<{ from: "me" | "ai"; text: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
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
    <div className="fixed bottom-4 right-4 z-10 w-[min(360px,calc(100vw-2rem))]">
      {open ? (
        <div className="flex h-[460px] flex-col rounded-xl border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm"><b>Chat with {salon}</b><button onClick={() => setOpen(false)} className="text-slate-400">✕</button></div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            <p className="text-xs text-slate-400">AI receptionist · any language · can check slots and book for you.</p>
            {msgs.map((m, i) => <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 ${m.from === "me" ? "ml-auto bg-brand-50" : "bg-slate-100"}`}>{m.text}</div>)}
            {busy && <div className="w-16 rounded-xl bg-slate-100 px-3 py-2 text-slate-400">…</div>}
          </div>
          <form onSubmit={send} className="space-y-1 border-t p-2">
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Your mobile (+91…)" className="w-full rounded border px-2 py-1 text-xs" required />
            <div className="flex gap-1">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="flex-1 rounded border px-2 py-1 text-sm" />
              <button disabled={busy} className="rounded bg-brand-600 px-3 text-sm text-white disabled:opacity-50">Send</button>
            </div>
          </form>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="ml-auto block rounded-full bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-brand-700">💬 Chat & book</button>
      )}
    </div>
  );
}
