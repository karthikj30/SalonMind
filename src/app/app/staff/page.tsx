import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addAdjustment, addStaff, addTimeOff, deleteTimeOff, runPayroll, toggleStaff } from "../actions";
import { addDays, fmtDate, fmtDateTime, inr, todayIst } from "@/lib/time";

type Stat = { pf_employee: number; esi_employee: number; pt: number; employer_contributions: number } | null;
type Line = { statutory?: Stat; employer_cost?: number; gross?: number; name: string; type: string; service_revenue: number; product_revenue: number; base: number; service_commission: number; product_commission: number; tips: number; penalties: number; bonus: number; booth_payout: number; net: number; breakdown: { range: string; amount: number }[] };

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: staff }, { data: runs }, { data: learning }, { data: adj }, { data: leave }] = await Promise.all([
    db.from("staff").select("*").eq("tenant_id", tenant.id).order("name"),
    db.from("payroll_runs").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(3),
    db.from("learning_assignments").select("*, staff(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(10),
    db.from("staff_adjustments").select("*, staff(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(8),
    db.from("staff_time_off").select("*, staff(name)").eq("tenant_id", tenant.id).gte("end_at", new Date().toISOString()).order("start_at"),
  ]);
  const today = todayIst();
  const latest = runs?.[0];
  return (
    <>
      <PageHeader title="Staff & Payroll" subtitle="Skill levels and specialties drive the matrix scheduler. Commission slabs are progressive (each slab % applies to revenue within it). Booth renters receive a revenue share instead." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Team" className="lg:col-span-2">
          <Table head={["Name", "Role", "Skill", "Specialties", "Hours", "Type", "Pay", ""]} empty="No staff yet.">
            {(staff ?? []).map((st) => (
              <tr key={st.id} className={st.active ? "" : "opacity-50"}>
                <Td className="font-medium">{st.name}</Td><Td>{st.role}</Td><Td>L{st.skill_level}</Td><Td className="text-xs">{st.skills.join(", ")}</Td>
                <Td className="text-xs">{st.work_start.slice(0, 5)}–{st.work_end.slice(0, 5)}</Td>
                <Td>{st.employment_type === "booth_renter" ? <Badge tone="violet">booth renter {100 - st.booth_rent_pct}% share</Badge> : <Badge>employee</Badge>}</Td>
                <Td className="text-xs">{st.employment_type === "employee" ? `${inr(st.base_salary)} + ${st.commission_slabs.map((x: { upto: number | null; pct: number }) => `${x.pct}%${x.upto ? "≤" + x.upto / 1000 + "k" : "+"}`).join("/")}` : "—"}</Td>
                <Td><form action={toggleStaff}><input type="hidden" name="id" value={st.id} /><input type="hidden" name="active" value={String(st.active)} /><button className="text-xs text-slate-500 hover:text-brand-600">{st.active ? "Deactivate" : "Activate"}</button></form></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Add staff member">
          <form action={addStaff} className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input name="name" required /></Field>
            <Field label="Role"><Select name="role">{["stylist", "colourist", "beautician", "nail artist", "makeup artist", "barber", "therapist", "manager"].map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Skill level (1-5)"><Input name="skill_level" type="number" min={1} max={5} defaultValue={3} /></Field>
            <Field label="Specialties" hint="comma-separated: hair, colour, balayage, bridal" className="col-span-2"><Input name="skills" /></Field>
            <Field label="Shift start"><Input name="work_start" type="time" defaultValue="10:00" /></Field>
            <Field label="Shift end"><Input name="work_end" type="time" defaultValue="20:00" /></Field>
            <Field label="Employment"><Select name="employment_type"><option value="employee">Employee</option><option value="booth_renter">Booth renter</option></Select></Field>
            <Field label="Booth rent % (salon keeps)"><Input name="booth_rent_pct" type="number" defaultValue={0} /></Field>
            <Field label="Base salary ₹/month"><Input name="base_salary" type="number" defaultValue={15000} /></Field>
            <Field label="Cost ₹/hour"><Input name="hourly_cost" type="number" defaultValue={200} /></Field>
            <Field label="Product commission %"><Input name="product_commission_pct" type="number" defaultValue={5} /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Gender (for PT slabs)"><Select name="gender" defaultValue=""><option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></Field>
            <div className="flex items-end gap-3 text-xs"><label className="flex items-center gap-1"><input type="checkbox" name="pf_enabled" defaultChecked /> PF</label><label className="flex items-center gap-1"><input type="checkbox" name="esi_enabled" defaultChecked /> ESI</label></div>
            <Field label="Commission slabs (JSON)" className="col-span-2"><Textarea name="commission_slabs" defaultValue='[{"upto":50000,"pct":10},{"upto":150000,"pct":15},{"upto":null,"pct":20}]' /></Field>
            <div className="col-span-2"><SubmitButton>Add</SubmitButton></div>
          </form>
        </Card>
        <Card title="Run payroll" className="lg:col-span-2">
          <form action={runPayroll} className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="From"><Input name="from" type="date" defaultValue={today.slice(0, 8) + "01"} /></Field>
            <Field label="To"><Input name="to" type="date" defaultValue={today} /></Field>
            <SubmitButton>Compute</SubmitButton>
          </form>
          {latest ? (
            <>
              <p className="mb-2 text-xs text-slate-500">Latest run {fmtDate(latest.period_start)} → {fmtDate(latest.period_end)} · total <b>{inr(latest.total)}</b></p>
              <Table head={["Staff", "Service rev", "Product rev", "Base", "Svc comm.", "Prod comm.", "Tips", "Penalty", "PF / ESI / PT", "Net pay", "Employer cost"]}>
                {(latest.lines as Line[]).map((l, i) => (
                  <tr key={i}>
                    <Td className="font-medium">{l.name}<div className="text-[11px] font-normal text-slate-500">{l.breakdown.map((b) => `${b.range}: ₹${b.amount}`).join(" · ")}</div></Td>
                    <Td>{inr(l.service_revenue)}</Td><Td>{inr(l.product_revenue)}</Td><Td>{inr(l.base)}</Td>
                    <Td>{l.type === "booth_renter" ? inr(l.booth_payout) : inr(l.service_commission)}</Td><Td>{inr(l.product_commission)}</Td>
                    <Td>{inr(l.tips)}</Td><Td>{inr(l.penalties)}</Td>
                    <Td className="text-xs">{l.statutory ? `${inr(l.statutory.pf_employee)} / ${inr(l.statutory.esi_employee)} / ${inr(l.statutory.pt)}` : "—"}</Td>
                    <Td className="font-semibold">{inr(l.net)}</Td><Td className="text-xs">{l.employer_cost !== undefined ? inr(l.employer_cost) : "—"}</Td>
                  </tr>
                ))}
              </Table>
            </>
          ) : <p className="text-sm text-slate-400">No payroll runs yet.</p>}
        </Card>
        <div className="space-y-4">
          <Card title="Tips, penalties, bonuses">
            <form action={addAdjustment} className="grid grid-cols-2 gap-2">
              <Field label="Staff" className="col-span-2"><Select name="staff_id" required>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Kind"><Select name="kind"><option>tip</option><option>penalty</option><option>bonus</option></Select></Field>
              <Field label="Amount ₹"><Input name="amount" type="number" required /></Field>
              <Field label="Note" className="col-span-2"><Input name="note" /></Field>
              <div className="col-span-2"><SubmitButton>Record</SubmitButton></div>
            </form>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">{(adj ?? []).map((a) => <li key={a.id}>{a.staff?.name}: {a.kind} {inr(a.amount)} {a.note && `· ${a.note}`}</li>)}</ul>
          </Card>
          <Card title="Stylist calendar feeds (Google / Apple / Outlook)">
            <p className="mb-2 text-xs text-slate-500">Each stylist subscribes once (Google Calendar → Other calendars → From URL); bookings and leave sync automatically. Keep links private.</p>
            <ul className="space-y-1 text-xs">{(staff ?? []).filter((s) => s.active).map((s) => <li key={s.id}><b>{s.name}</b>: <code className="break-all">{`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/ics/${s.calendar_token}.ics`}</code></li>)}</ul>
          </Card>
          <Card title="Leave & blocked time">
            <form action={addTimeOff} className="grid grid-cols-2 gap-2">
              <Field label="Staff" className="col-span-2"><Select name="staff_id" required>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="From date"><Input name="from_date" type="date" defaultValue={today} required /></Field>
              <Field label="From time"><Input name="from_time" type="time" defaultValue="00:00" /></Field>
              <Field label="To date"><Input name="to_date" type="date" defaultValue={today} /></Field>
              <Field label="To time"><Input name="to_time" type="time" defaultValue="23:59" /></Field>
              <Field label="Reason" className="col-span-2"><Input name="reason" placeholder="Sick leave / lunch / training" /></Field>
              <div className="col-span-2"><SubmitButton>Block time</SubmitButton></div>
            </form>
            <ul className="mt-3 space-y-1 text-xs">{(leave ?? []).map((l) => <li key={l.id} className="flex justify-between gap-2"><span><b>{l.staff?.name}</b>: {fmtDateTime(l.start_at)} → {fmtDateTime(l.end_at)} {l.reason && `· ${l.reason}`}</span><form action={deleteTimeOff}><input type="hidden" name="id" value={l.id} /><button className="text-red-600">✕</button></form></li>)}</ul>
          </Card>
          <Card title="Micro-learning (assigned by Performance Coach Agent)">
            {(learning ?? []).length ? (
              <ul className="space-y-2 text-sm">{(learning ?? []).map((l) => <li key={l.id}><b>{l.staff?.name}</b> → {l.module}<div className="text-xs text-slate-500">{l.reason}</div></li>)}</ul>
            ) : <p className="text-sm text-slate-400">None yet. The agent assigns modules when it sees low ratings, waste flags or low utilisation.</p>}
          </Card>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400">Tip: the payroll period defaults to month-to-date ({addDays(today, 0).slice(0, 8)}01 → {today}).</p>
    </>
  );
}
