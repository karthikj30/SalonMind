import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { manualReply, setConversationStatus, simulateInbound } from "../actions";
import { fmtDateTime } from "@/lib/time";

const CH: Record<string, string> = { whatsapp: "🟢 WhatsApp", instagram: "📸 Instagram", google: "🔵 Google Business", call: "📞 Call transcript", sms: "✉️ SMS", web: "🌐 Web chat", email: "📧 Email" };

export default async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const { data: convos } = await db.from("conversations").select("contact_handle, status, reason").eq("tenant_id", tenant.id);
  const human = new Map((convos ?? []).filter((c) => c.status === "human").map((c) => [c.contact_handle, c.reason]));
  const { data: msgs } = await db.from("messages").select("*, clients(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(300);
  const threads = new Map<string, { handle: string; last: NonNullable<typeof msgs>[number]; count: number; name: string | null }>();
  (msgs ?? []).forEach((m) => {
    const h = m.contact_handle ?? "unknown";
    const t = threads.get(h);
    if (!t) threads.set(h, { handle: h, last: m, count: 1, name: m.clients?.name ?? (m.meta?.name as string) ?? null });
    else { t.count++; t.name = t.name ?? m.clients?.name ?? null; }
  });
  const active = sp.h ?? [...threads.keys()][0];
  const thread = (msgs ?? []).filter((m) => (m.contact_handle ?? "unknown") === active).reverse();
  const last = thread[thread.length - 1];
  return (
    <>
      <PageHeader title="Unified Inbox" subtitle="WhatsApp, Instagram DMs, Google Business messages, call transcripts and web chat land here; the AI Concierge replies in the customer's language and can book directly. Outbound messages show as “simulated” unless WhatsApp Cloud API keys are configured." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr_300px]">
        <Card title="Conversations">
          <ul className="-mx-2 space-y-0.5">
            {[...threads.values()].map((t) => (
              <li key={t.handle}>
                <a href={`?h=${encodeURIComponent(t.handle)}`} className={`block rounded-lg px-2 py-1.5 text-sm ${t.handle === active ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                  <div className="flex justify-between"><b className="truncate">{human.has(t.handle) && "👤 "}{t.name ?? t.handle}</b><span className="text-[10px] text-slate-400">{CH[t.last.channel]?.split(" ")[0]}</span></div>
                  <p className="truncate text-xs text-slate-500">{t.last.body}</p>
                </a>
              </li>
            ))}
            {!threads.size && <p className="px-2 text-sm text-slate-400">No conversations yet — send a test message →</p>}
          </ul>
        </Card>
        <Card title={active ? `Thread · ${active}` : "Thread"} actions={active ? (
          <form action={setConversationStatus} className="flex items-center gap-2 text-xs">
            <input type="hidden" name="handle" value={active} /><input type="hidden" name="status" value={human.has(active) ? "ai" : "human"} />
            {human.has(active) ? <Badge tone="red">👤 human handling · {human.get(active)}</Badge> : <Badge tone="violet">🤖 AI handling</Badge>}
            <button className="text-brand-600 hover:underline">{human.has(active) ? "Hand back to AI" : "Take over"}</button>
          </form>) : null}>
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {thread.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.direction === "in" ? "self-start bg-slate-100" : "self-end bg-brand-50"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                  {CH[m.channel]} · {fmtDateTime(m.created_at)} {m.agent && <Badge tone="violet">{m.agent}</Badge>} {m.direction === "out" && <Badge tone={m.status === "sent" ? "green" : "amber"}>{m.status}</Badge>}
                  {m.meta?.intent && <Badge tone="blue">intent: {String(m.meta.intent)} · {String(m.meta.language)}</Badge>}
                </p>
              </div>
            ))}
          </div>
          {last && (
            <form action={manualReply} className="mt-3 flex gap-2">
              <input type="hidden" name="handle" value={active} /><input type="hidden" name="channel" value={last.channel} /><input type="hidden" name="client_id" value={last.client_id ?? ""} />
              <Input name="body" placeholder="Reply manually (human takeover)…" required />
              <SubmitButton variant="secondary">Send</SubmitButton>
            </form>
          )}
        </Card>
        <Card title="Test: incoming message">
          <form action={simulateInbound} className="space-y-2">
            <Field label="Channel"><Select name="channel">{Object.entries(CH).filter(([k]) => k !== "email").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="From (phone or handle)" hint="Use a client's phone to link the thread to them"><Input name="handle" defaultValue={sp.h ?? ""} placeholder="+919876543210 or @insta_handle" required /></Field>
            <Field label="Name (optional)"><Input name="name" /></Field>
            <Field label="Message" hint="Try: “kal shaam 6 baje haircut book kar do” or “How much is balayage?”"><Textarea name="body" required /></Field>
            <SubmitButton pendingText="AI replying…">Receive message</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
