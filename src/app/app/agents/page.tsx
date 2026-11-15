import { getTenantContext } from "@/lib/tenant";
import { AGENTS } from "@/lib/agents/registry";
import { providerStatus } from "@/lib/ai/llm";
import { Badge, Card, Flash, PageHeader, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { drainQueue, runAgentNow } from "../actions";
import { fmtDateTime } from "@/lib/time";

export default async function Agents({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: runs }, { data: events }] = await Promise.all([
    db.from("agent_runs").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(60),
    db.from("agent_events").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const filtered = sp.agent ? (runs ?? []).filter((r) => r.agent === sp.agent) : runs ?? [];
  const modules = [...new Set(AGENTS.map((a) => a.module))];
  return (
    <>
      <PageHeader eyebrow="AI" title="Agent Console" subtitle="Every agent, what it listens to, and everything it did. Agents talk asynchronously through the event bus (agent_events); the orchestrator runs periodic agents on a schedule (Supabase pg_cron → /api/agents/tick) or when you click Run.">
        <form action={runAgentNow}><input type="hidden" name="agent" value="all" /><SubmitButton pendingText="Orchestrating…">▶ Run full orchestrator</SubmitButton></form>
        <form action={drainQueue}><SubmitButton variant="secondary">Retry / drain queue</SubmitButton></form>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      <Card title="LLM providers (free tiers)" className="mb-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {providerStatus().map((p) => <Badge key={p.name} tone={p.configured ? "green" : "slate"}>{p.name}{p.vision ? " 👁" : ""}: {p.configured ? "configured" : "no key"}</Badge>)}
          <Badge tone="violet">rules-engine: always on (fallback)</Badge>
        </div>
      </Card>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Card key={m} title={m}>
            <ul className="space-y-3">
              {AGENTS.filter((a) => a.module === m).map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <a href={`?agent=${a.id}`} className="font-medium hover:text-brand-600">{a.name}</a>
                    {a.periodic ? <form action={runAgentNow}><input type="hidden" name="agent" value={a.id} /><SubmitButton variant="secondary" className="!px-2 !py-0.5 text-xs">Run</SubmitButton></form> : <Badge>event-driven</Badge>}
                  </div>
                  <p className="text-xs text-brand-900/55">{a.description}</p>
                  {a.subscribes.length > 0 && <p className="mt-0.5 text-[11px] text-violet-700">listens: {a.subscribes.join(", ")}</p>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`Run log${sp.agent ? ` · ${sp.agent}` : ""}`} className="xl:col-span-2" actions={sp.agent ? <a href="?" className="text-xs text-brand-600">clear filter</a> : null}>
          <Table head={["When", "Agent", "Trigger", "Summary / actions", "Engine", "ms"]} empty="No runs yet. Click Run, or create a booking / send an inbox message.">
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</Td>
                <Td><Badge tone={r.status === "ok" ? "blue" : "red"}>{r.agent}</Badge></Td>
                <Td className="text-xs">{r.trigger}</Td>
                <Td><p className="text-sm">{r.summary}</p>{(r.actions as { label: string }[]).length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-brand-900/65">{(r.actions as { label: string }[]).map((a, i) => <li key={i}>{a.label}</li>)}</ul>}
                  {r.output && <details className="text-[11px]"><summary className="cursor-pointer text-brand-900/40">output</summary><pre className="max-h-48 overflow-auto rounded bg-ivory-100 p-1">{JSON.stringify(r.output, null, 1)}</pre></details>}</Td>
                <Td className="text-[11px]">{r.provider}</Td><Td className="text-xs">{r.duration_ms}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Event bus (latest 30)">
          <ul className="space-y-1.5 text-xs">
            {(events ?? []).map((e) => (
              <li key={e.id} className="rounded border px-2 py-1">
                <div className="flex justify-between"><b>{e.type}</b><Badge tone={e.status === "done" ? "green" : e.status === "failed" ? "red" : "amber"}>{e.status}</Badge></div>
                <div className="text-brand-900/55">from {e.source} · {fmtDateTime(e.created_at)}</div>
                {e.error && <div className="text-red-600">{e.error}</div>}
              </li>
            ))}
            {!events?.length && <li className="text-brand-900/40">No events yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
