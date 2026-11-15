import { getTenantContext } from "@/lib/tenant";
import { computeDatasets, DATASETS, type Widget } from "@/lib/services/metrics";
import { WidgetGrid } from "@/components/Widgets";
import { Card, Field, Flash, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { configureWorkflowAction, generateLayoutAction, resetLayout, toggleAgent } from "../actions";
import { AGENTS } from "@/lib/agents/registry";
import { PARAM_BOUNDS, PROTECTED_AGENTS } from "@/lib/domain/workflow";
import { Badge } from "@/components/ui";
import { Workflow } from "lucide-react";
import { LANGUAGES } from "@/lib/ai/llm";

export default async function Studio({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const layout = tenant.ui_layout as { widgets: Widget[]; prompt: string; provider: string; language: string } | null;
  const data = layout?.widgets ? await computeDatasets(db, tenant.id, layout.widgets.map((w) => w.dataset)) : {};
  return (
    <>
      <PageHeader eyebrow="AI" title="AI Studio" subtitle="Self-configuring platform: describe how your agents should behave, or the dashboard you want, in any language. The model only proposes — typed schemas, allow-lists and bounds decide what is applied, and every change is logged." />
      <Flash msg={sp.msg} error={sp.error} />
      <Card title="Workflow designer — configure agents in plain language" icon={<Workflow className="h-4 w-4" />} className="mb-4">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <form action={configureWorkflowAction} className="space-y-2">
              <Field label="What should change?" hint="The AI proposes; only allowed agents and in-range values are applied, and every change is logged in the Agent Console."><Textarea name="prompt" rows={3} required placeholder="Turn off the waitlist and pause flash deals during Diwali week, ask for a 40% deposit and cap surge at 30%." /></Field>
              <SubmitButton pendingText="Configuring…">Apply</SubmitButton>
            </form>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-brand-900/60">
              {Object.entries(PARAM_BOUNDS).map(([k, b]) => <p key={k} className="flex justify-between gap-2"><span>{b.label}</span><b className="text-brand-900">{String((tenant.settings as Record<string, unknown>)[k])}</b></p>)}
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {AGENTS.map((a) => {
              const off = (tenant.settings.agents_disabled ?? []).includes(a.id);
              const locked = PROTECTED_AGENTS.includes(a.id);
              return (
                <li key={a.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition ${off ? "border-dashed border-brand-200 opacity-70" : "border-brand-100 bg-ivory-50"}`}>
                  <span className="min-w-0"><span className="block truncate font-medium text-brand-900">{a.name}</span><span className="text-[11px] text-brand-900/50">{a.module}</span></span>
                  {locked ? <Badge tone="gold">always on</Badge> : (
                    <form action={toggleAgent}><input type="hidden" name="agent" value={a.id} /><input type="hidden" name="enabled" value={String(off)} />
                      <button role="switch" aria-checked={!off} aria-label={`${off ? "Resume" : "Pause"} ${a.name}`} className={`relative h-6 w-11 rounded-full transition-colors ${off ? "bg-brand-200" : "bg-rose-gold"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#fff] shadow transition-all ${off ? "left-0.5" : "left-[22px]"}`} />
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Describe your dashboard">
          <form action={generateLayoutAction} className="space-y-2">
            <Field label="Prompt"><Textarea name="prompt" rows={4} required defaultValue={layout?.prompt ?? "I'm the front-desk manager. Show today's bookings and revenue first, then clients at risk and live deals."} /></Field>
            <Field label="Language for widget titles"><Select name="language" defaultValue={layout?.language ?? "en"}>{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <SubmitButton pendingText="Generating…">Generate</SubmitButton>
          </form>
          <form action={resetLayout} className="mt-2"><SubmitButton variant="ghost">Reset to default</SubmitButton></form>
          <p className="mt-3 text-xs text-brand-900/55">Available widgets: {Object.values(DATASETS).map((d) => d.title).join(", ")}.</p>
        </Card>
        <div className="lg:col-span-2">
          {layout?.widgets ? (
            <>
              <p className="mb-2 text-xs text-brand-900/55">Generated by {layout.provider} · {layout.widgets.length} widgets</p>
              <WidgetGrid widgets={layout.widgets} data={data} />
              <details className="mt-3 text-xs"><summary className="cursor-pointer text-brand-900/55">Layout schema (JSON)</summary><pre className="mt-1 rounded bg-surface p-2">{JSON.stringify(layout.widgets, null, 2)}</pre></details>
            </>
          ) : <Card><p className="text-sm text-brand-900/40">No custom layout yet — generate one.</p></Card>}
        </div>
      </div>
    </>
  );
}
