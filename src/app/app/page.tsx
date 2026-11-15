import { getTenantContext } from "@/lib/tenant";
import { computeDatasets, DEFAULT_LAYOUT, type Widget } from "@/lib/services/metrics";
import { WidgetGrid } from "@/components/Widgets";
import { Card, Flash, LinkButton, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { runAgentNow } from "./actions";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const layout = (tenant.ui_layout as { widgets?: Widget[]; prompt?: string } | null);
  const widgets = layout?.widgets?.length ? layout.widgets : DEFAULT_LAYOUT;
  const data = await computeDatasets(db, tenant.id, widgets.map((w) => w.dataset));
  const [{ count: staff }, { count: services }, { count: products }] = await Promise.all([
    db.from("staff").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    db.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    db.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
  ]);
  const steps = [
    { ok: (staff ?? 0) > 0, label: "Add your stylists", href: "/app/staff" },
    { ok: (services ?? 0) > 0, label: "Add services (and rooms/stations)", href: "/app/services" },
    { ok: (products ?? 0) > 0, label: "Add products & vendors", href: "/app/inventory" },
  ];
  return (
    <>
      <PageHeader title={`Good day, ${tenant.name}`} subtitle={layout?.prompt ? `AI-generated layout: “${layout.prompt}”` : "Your salon at a glance. Agents work in the background — see the Agent Console for everything they did."}>
        <form action={runAgentNow}><input type="hidden" name="agent" value="all" /><SubmitButton pendingText="Agents working…">▶ Run all agents now</SubmitButton></form>
        <LinkButton href="/app/bookings">New booking</LinkButton>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      {steps.some((s) => !s.ok) && (
        <Card title="Get started — set up your salon manually" className="mb-4">
          <ol className="space-y-1 text-sm">
            {steps.map((s, i) => <li key={i}>{s.ok ? "✅" : "⬜"} <a className="text-brand-700 hover:underline" href={s.href}>{s.label}</a></li>)}
            <li>⬜ Then create bookings, complete them, send test messages in the Unified Inbox, and watch the Agent Console.</li>
          </ol>
        </Card>
      )}
      <WidgetGrid widgets={widgets} data={data} />
    </>
  );
}
