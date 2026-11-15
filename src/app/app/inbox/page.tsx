import Link from "next/link";
import { ArrowLeft, Bot, Check, CheckCheck, Clock, Lock, MessageSquarePlus, Search, UserRound } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { Field, Flash, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { manualReply, setConversationStatus, simulateInbound } from "../actions";
import { toIst, todayIst, addDays } from "@/lib/time";
import { LANGUAGES } from "@/lib/ai/llm";
import { Composer } from "./Composer";

const CH: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: "🟢", color: "#25d366" },
  instagram: { label: "Instagram", icon: "📸", color: "#e1306c" },
  google: { label: "Google Business", icon: "🔵", color: "#4285f4" },
  call: { label: "Call transcript", icon: "📞", color: "#8e7cc3" },
  sms: { label: "SMS", icon: "✉️", color: "#f4a261" },
  web: { label: "Web chat", icon: "🌐", color: "#2a9d8f" },
  email: { label: "Email", icon: "📧", color: "#6c757d" },
};
const AVATAR = ["#00a884", "#7f66ff", "#e26a6a", "#f4a261", "#2a9d8f", "#d96fb3", "#5e8fd8", "#c99b2b"];
const hue = (s: string) => AVATAR[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
const initials = (s: string) => s.replace(/^[@+]/, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const isPhone = (h: string) => /^\+?\d[\d\s-]{7,}$/.test(h);

function dayLabel(iso: string) {
  const d = toIst(new Date(iso)).date;
  if (d === todayIst()) return "Today";
  if (d === addDays(todayIst(), -1)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}
function listTime(iso: string) {
  const d = toIst(new Date(iso)).date;
  if (d === todayIst()) return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  if (d === addDays(todayIst(), -1)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit" });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

function Ticks({ status }: { status: string }) {
  if (status === "sent" || status === "delivered") return <CheckCheck className="h-4 w-4 text-[var(--wa-tick)]" aria-label="Sent" />;
  if (status === "failed") return <span className="text-[11px] font-semibold text-red-500" aria-label="Failed">!</span>;
  if (status === "queued") return <Clock className="h-3.5 w-3.5" aria-label="Queued" />;
  return <Check className="h-4 w-4" aria-label="Simulated (no WhatsApp API key)" />;
}

export default async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const { data: convos } = await db.from("conversations").select("contact_handle, status, reason").eq("tenant_id", tenant.id);
  const human = new Map((convos ?? []).filter((c) => c.status === "human").map((c) => [c.contact_handle, c.reason]));
  const { data: msgs } = await db.from("messages").select("*, clients(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(400);

  type Msg = NonNullable<typeof msgs>[number];
  const threads = new Map<string, { handle: string; last: Msg; name: string | null; unread: number; seenOut: boolean }>();
  (msgs ?? []).forEach((m) => {
    const h = m.contact_handle ?? "unknown";
    const t = threads.get(h);
    const nm = m.clients?.name ?? ((m.meta?.name as string) || null);
    if (!t) threads.set(h, { handle: h, last: m, name: nm, unread: m.direction === "in" ? 1 : 0, seenOut: m.direction === "out" });
    else {
      t.name = t.name ?? nm;
      if (!t.seenOut && m.direction === "in") t.unread++;
      if (m.direction === "out") t.seenOut = true;
    }
  });
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter = sp.f === "human" || sp.f === "ai" ? sp.f : "all";
  const list = [...threads.values()]
    .filter((t) => (filter === "all" ? true : filter === "human" ? human.has(t.handle) : !human.has(t.handle)))
    .filter((t) => !q || `${t.name ?? ""} ${t.handle} ${t.last.body}`.toLowerCase().includes(q));

  const showThread = Boolean(sp.h); // phones: list OR thread; desktop: both
  const active = sp.h ?? list[0]?.handle ?? [...threads.keys()][0];
  const cur = active ? threads.get(active) : undefined;
  const thread = (msgs ?? []).filter((m) => (m.contact_handle ?? "unknown") === active).reverse();
  const last = thread[thread.length - 1];
  const lang = [...thread].reverse().find((m) => m.direction === "in" && m.meta?.language)?.meta?.language as string | undefined;
  const title = cur?.name ?? active ?? "";
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ f: filter === "all" ? undefined : filter, q: sp.q, ...o }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold-600">Front desk</p>
          <h1 className="font-display text-2xl font-semibold text-brand-950 sm:text-3xl">Unified Inbox</h1>
          <p className="mt-0.5 hidden max-w-2xl text-sm text-brand-900/60 sm:block">WhatsApp, Instagram, Google Business, call transcripts and web chat in one WhatsApp-style view. The AI Concierge replies in the customer&apos;s language and books on a YES.</p>
        </div>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <div className="grid h-[calc(100dvh-10.5rem)] min-h-[520px] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--wa-line)] bg-[var(--wa-in)] shadow-soft md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] sm:h-[calc(100dvh-12rem)]">
        {/* ── Chat list ── */}
        <aside className={`${showThread ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-[var(--wa-line)] bg-[var(--wa-in)]`} aria-label="Conversations">
          <div className="flex items-center justify-between bg-[var(--wa-panel)] px-3 py-2.5">
            <span className="text-base font-semibold text-[var(--wa-text)]">Chats <span className="text-xs font-normal text-[var(--wa-meta)]">{threads.size}</span></span>
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-[var(--wa-send)] hover:bg-[var(--wa-active)] [&::-webkit-details-marker]:hidden" title="Simulate a new incoming message">
                <MessageSquarePlus className="h-4 w-4" /> New test chat
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-[var(--wa-line)] bg-surface p-3 shadow-lift">
                <form action={simulateInbound} className="space-y-2" aria-label="Test: incoming message">
                  <p className="text-sm font-semibold text-brand-950">Test: incoming message</p>
                  <Field label="Channel"><Select name="channel">{Object.entries(CH).filter(([k]) => k !== "email").map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</Select></Field>
                  <Field label="From (phone or handle)" hint="Use a client's phone to link the thread to them"><Input name="handle" placeholder="+919876543210 or @insta_handle" required inputMode="tel" /></Field>
                  <Field label="Name (optional)"><Input name="name" /></Field>
                  <Field label="Message" hint="Any language — try “kal shaam 6 baje haircut book kar do”, “நாளை மாலை 6 மணிக்கு ஹேர்கட்”, “کل شام 6 بجے ہیئر کٹ”"><Textarea name="body" required dir="auto" /></Field>
                  <SubmitButton pendingText="AI replying…">Receive message</SubmitButton>
                </form>
              </div>
            </details>
          </div>
          <form className="border-b border-[var(--wa-line)] px-3 py-2" role="search">
            {filter !== "all" && <input type="hidden" name="f" value={filter} />}
            <label className="flex items-center gap-2 rounded-lg bg-[var(--wa-panel)] px-3 py-1.5">
              <Search className="h-4 w-4 text-[var(--wa-meta)]" aria-hidden />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search or start a new chat" aria-label="Search chats" className="w-full bg-transparent text-sm text-[var(--wa-text)] placeholder:text-[var(--wa-meta)] focus:outline-none" />
            </label>
            <div className="mt-2 flex gap-1.5 text-xs">
              {([["all", "All"], ["ai", "🤖 AI"], ["human", "👤 Human"]] as const).map(([k, l]) => (
                <Link key={k} href={qs({ f: k === "all" ? undefined : k, h: undefined })} className={`rounded-full px-3 py-1 transition ${filter === k ? "bg-[#d9fdd3] font-medium text-[#008069] dark:bg-[#0a332c] dark:text-[#00a884]" : "bg-[var(--wa-panel)] text-[var(--wa-meta)] hover:bg-[var(--wa-active)]"}`}>{l}</Link>
              ))}
            </div>
          </form>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.map((t) => {
              const nm = t.name ?? t.handle;
              const ch = CH[t.last.channel] ?? CH.web;
              return (
                <li key={t.handle}>
                  <Link href={qs({ h: t.handle })} className={`flex items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--wa-active)] ${t.handle === active ? "md:bg-[var(--wa-active)]" : ""}`}>
                    <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: hue(t.handle) }}>
                      {initials(nm)}
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--wa-in)] text-[10px]" style={{ background: ch.color }} title={ch.label}>{ch.icon}</span>
                    </span>
                    <span className="min-w-0 flex-1 border-b border-[var(--wa-line)] pb-2.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-[var(--wa-text)]">{human.has(t.handle) && "👤 "}{nm}</span>
                        <span className={`shrink-0 text-[11px] ${t.unread ? "font-medium text-[var(--wa-green)]" : "text-[var(--wa-meta)]"}`}>{listTime(t.last.created_at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 text-sm text-[var(--wa-meta)]">
                          {t.last.direction === "out" && <span className="shrink-0"><Ticks status={t.last.status} /></span>}
                          {t.last.direction === "out" && t.last.agent && t.last.agent !== "human" && <Bot className="h-3.5 w-3.5 shrink-0" aria-label="AI" />}
                          <span className="truncate" dir="auto">{t.last.body}</span>
                        </span>
                        {t.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] px-1.5 text-[11px] font-semibold text-white">{t.unread}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {!list.length && (
              <li className="p-6 text-center text-sm text-[var(--wa-meta)]">
                {threads.size ? "No chats match." : <>No conversations yet.<br />Tap <b>New test chat</b> to send one, or share your salon page — web-chat messages land here.</>}
              </li>
            )}
          </ul>
        </aside>

        {/* ── Thread ── */}
        <section className={`${showThread ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`} aria-label="Conversation">
          {!active || !cur ? (
            <div className="wa-wall flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--wa-meta)]">
              <Lock className="h-6 w-6" /> Select a chat — or start one with <b>New test chat</b>.
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2 bg-[var(--wa-panel)] px-2 py-2 sm:gap-3 sm:px-3">
                <Link href={qs({ h: undefined })} className="grid h-9 w-9 place-items-center rounded-full text-[var(--wa-text)] hover:bg-[var(--wa-active)] md:hidden" aria-label="Back to chats"><ArrowLeft className="h-5 w-5" /></Link>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: hue(active) }}>{initials(title)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[var(--wa-text)]">{title}</p>
                  <p className="truncate text-xs text-[var(--wa-meta)]">
                    {(CH[last?.channel ?? "web"] ?? CH.web).label}{title !== active && ` · ${active}`}{lang && ` · ${LANGUAGES[lang] ?? lang}`} · {human.has(active) ? `👤 ${human.get(active) ?? "staff"}` : "🤖 AI concierge"}
                  </p>
                </div>
                <form action={setConversationStatus}>
                  <input type="hidden" name="handle" value={active} /><input type="hidden" name="status" value={human.has(active) ? "ai" : "human"} />
                  <button className="inline-flex items-center gap-1 rounded-full border border-[var(--wa-line)] bg-[var(--wa-in)] px-2.5 py-1.5 text-xs font-medium text-[var(--wa-text)] hover:bg-[var(--wa-active)]" title={human.has(active) ? "Let the AI concierge reply again" : "Pause the AI and reply yourself"}>
                    {human.has(active) ? <><Bot className="h-3.5 w-3.5" /><span className="hidden sm:inline">Hand back to AI</span><span className="sm:hidden">AI</span></> : <><UserRound className="h-3.5 w-3.5" /><span className="hidden sm:inline">Take over</span><span className="sm:hidden">Take</span></>}
                  </button>
                </form>
                {isPhone(active) && (
                  <a href={`https://wa.me/${active.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] text-white hover:brightness-110" title="Open this chat in WhatsApp" aria-label="Open in WhatsApp">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
                  </a>
                )}
              </header>

              <div className="wa-wall min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-[6%]" aria-live="polite">
                <p className="mx-auto mb-3 flex max-w-md items-start justify-center gap-1.5 rounded-lg bg-[var(--wa-note)] px-3 py-1.5 text-center text-[11.5px] leading-snug text-[var(--wa-note-text)] shadow-sm">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" /> The AI Concierge answers in the customer&apos;s language and only books after they reply YES. Single ✓ = simulated (no WhatsApp API key), blue ✓✓ = sent.
                </p>
                <div className="flex flex-col gap-0.5">
                  {thread.map((m, i) => {
                    const prev = thread[i - 1];
                    const newDay = !prev || toIst(new Date(prev.created_at)).date !== toIst(new Date(m.created_at)).date;
                    const tail = newDay || !prev || prev.direction !== m.direction;
                    const out = m.direction === "out";
                    return (
                      <div key={m.id} className="contents">
                        {newDay && <p className="mx-auto my-2 rounded-lg bg-[var(--wa-in)] px-3 py-1 text-[11.5px] uppercase tracking-wide text-[var(--wa-meta)] shadow-sm">{dayLabel(m.created_at)}</p>}
                        <div className={`wa-bubble animate-fade-up ${out ? "wa-out self-end" : "wa-in self-start"} ${tail ? "wa-tail mt-1.5" : ""}`}>
                          {out && tail && <p className="mb-0.5 text-[11.5px] font-medium" style={{ color: m.agent === "human" ? "#7f66ff" : "#00a884" }}>{m.agent === "human" ? "👤 You" : `🤖 ${m.agent ?? "AI"}`}</p>}
                          <p className="whitespace-pre-wrap text-[14.5px] leading-snug" dir="auto">{m.body}</p>
                          <p className="wa-meta mt-0.5 flex flex-wrap items-center justify-end gap-1 text-[11px]">
                            {!out && m.meta?.intent && <span className="mr-auto rounded bg-black/5 px-1 dark:bg-white/10">{LANGUAGES[String(m.meta.language)] ?? String(m.meta.language ?? "")} · {String(m.meta.intent)}</span>}
                            {(CH[m.channel] ?? CH.web).icon} {clock(m.created_at)} {out && <Ticks status={m.status} />}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Composer handle={active} channel={last?.channel ?? "whatsapp"} clientId={last?.client_id ?? ""} name={cur.name ?? ""} reply={manualReply} inbound={simulateInbound} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
