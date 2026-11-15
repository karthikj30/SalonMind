import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addCandidate, candidateReply, createJob, setCandidateStatus } from "../actions";

type Ads = { naukri: string; apna: string; instagram: string; whatsapp: string; search_strings: string[] };

export default async function Hr({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: jobs }, { data: cands }] = await Promise.all([
    db.from("job_postings").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    db.from("candidates").select("*, job_postings(title)").eq("tenant_id", tenant.id).order("score", { ascending: false, nullsFirst: false }),
  ]);
  const sel = (cands ?? []).find((c) => c.id === sp.c);
  return (
    <>
      <PageHeader title="Recruitment" subtitle="Post a role → the Recruitment Agent writes Naukri / Apna / Instagram / WhatsApp ads + sourcing search strings. Paste a resume → it's screened, scored, and a chat interview starts." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Open roles" className="lg:col-span-2">
          {(jobs ?? []).length === 0 && <p className="text-sm text-slate-400">No roles yet.</p>}
          <div className="space-y-3">
            {(jobs ?? []).map((j) => {
              const ads = j.ad_copy as Ads | null;
              return (
                <details key={j.id} className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm"><b>{j.title}</b> · {j.location} · {j.salary_range} <Badge tone="green">{j.status}</Badge></summary>
                  {ads ? (
                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                      {(["naukri", "apna", "instagram", "whatsapp"] as const).map((k) => <div key={k} className="rounded bg-slate-50 p-2"><b className="uppercase text-slate-500">{k}</b><p className="whitespace-pre-wrap">{ads[k]}</p></div>)}
                      <div className="rounded bg-slate-50 p-2 sm:col-span-2"><b className="uppercase text-slate-500">Sourcing search strings</b><ul>{ads.search_strings?.map((x, i) => <li key={i}><code>{x}</code></li>)}</ul></div>
                    </div>
                  ) : <p className="mt-2 text-xs text-slate-400">Ads being generated…</p>}
                </details>
              );
            })}
          </div>
        </Card>
        <Card title="Post a role">
          <form action={createJob} className="space-y-2">
            <Field label="Title"><Input name="title" required placeholder="Senior Hair Colourist" /></Field>
            <Field label="Role"><Select name="role">{["stylist", "colourist", "beautician", "nail artist", "makeup artist", "barber", "manager", "receptionist"].map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Location"><Input name="location" defaultValue={tenant.city ?? ""} /></Field>
            <Field label="Salary range"><Input name="salary_range" placeholder="₹25,000–40,000 + commission" /></Field>
            <Field label="Requirements"><Textarea name="description" placeholder="3+ yrs balayage, L'Oréal certified, weekends" /></Field>
            <SubmitButton pendingText="Agent writing ads…">Post role</SubmitButton>
          </form>
        </Card>
        <Card title="Candidates" className="lg:col-span-2">
          <Table head={["Name", "Role", "Source", "Score", "Status", ""]} empty="No candidates yet.">
            {(cands ?? []).map((c) => (
              <tr key={c.id} className={c.id === sp.c ? "bg-brand-50" : ""}>
                <Td className="font-medium">{c.name}<div className="max-w-md text-xs font-normal text-slate-500">{c.summary}</div></Td>
                <Td>{c.job_postings?.title ?? "—"}</Td><Td>{c.source}</Td><Td>{c.score ?? "…"}</Td><Td><Badge tone={statusTone(c.status)}>{c.status}</Badge></Td>
                <Td><a href={`?c=${c.id}`} className="text-xs text-brand-600 hover:underline">Interview</a></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Add candidate (paste resume)">
          <form action={addCandidate} className="space-y-2">
            <Field label="Role"><Select name="job_id">{(jobs ?? []).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select></Field>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Source"><Select name="source">{["Naukri", "Apna", "Indeed", "Instagram", "LinkedIn", "Referral", "Walk-in"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Resume text"><Textarea name="resume_text" rows={6} required /></Field>
            <SubmitButton pendingText="Screening…">Add & screen</SubmitButton>
          </form>
        </Card>
        {sel && (
          <Card title={`Screening interview · ${sel.name}`} className="lg:col-span-3">
            <div className="mb-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
              {(sel.screening_chat as { from: string; text: string }[]).map((m, i) => (
                <div key={i} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.from === "agent" ? "self-start bg-slate-100" : "self-end bg-brand-50"}`}>{m.text}</div>
              ))}
              {!(sel.screening_chat as unknown[]).length && <p className="text-sm text-slate-400">No interview (candidate {sel.status}).</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={candidateReply} className="flex flex-1 gap-2">
                <input type="hidden" name="id" value={sel.id} />
                <Input name="answer" placeholder="Type the candidate's answer (test the conversational screener)…" required />
                <SubmitButton>Send</SubmitButton>
              </form>
              {["shortlisted", "hired", "rejected"].map((st) => (
                <form key={st} action={setCandidateStatus}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="status" value={st} /><SubmitButton variant="secondary">{st}</SubmitButton></form>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
