import "server-only";
import type { AgentDef, Tenant } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Staff } from "../domain/types";
import { payrollLine } from "../domain/payroll";
import { llm, llmJson, extractJson } from "../ai/llm";
import { istDate, timeToMin } from "../time";

export const LEARNING_MODULES = [
  "Advanced balayage & colour melting", "Precision men's fades", "Client consultation & upselling", "Product dosage & waste control",
  "Bridal makeup & draping", "Hygiene & sanitation SOPs", "Keratin & smoothening safety", "Time management between appointments",
  "Handling difficult clients", "Skin analysis for facials", "Nail art fundamentals", "Retail product knowledge",
];

const SCREEN_QUESTIONS = [
  "How many years have you worked as a stylist/beautician, and in which salons?",
  "Which services are you most confident in (e.g. colour, cuts, bridal, skin)?",
  "Are you comfortable with weekend and festival-season shifts?",
  "What monthly salary + commission are you expecting?",
  "How soon can you join, and which area do you live in?",
];

function ruleScreen(resume: string, job: { title: string; description: string | null }) {
  const r = resume.toLowerCase();
  const keys = `${job.title} ${job.description ?? ""}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  const hits = [...new Set(keys)].filter((k) => r.includes(k));
  const yrs = Number(r.match(/(\d+)\s*\+?\s*(years|yrs)/)?.[1] ?? 0);
  const certs = /(certif|diploma|vlcc|lakme|loreal|l'oreal|toni|academy|course)/.test(r);
  const score = Math.min(100, 30 + hits.length * 6 + Math.min(yrs, 8) * 5 + (certs ? 10 : 0));
  return { score, summary: `${yrs || "?"} yrs experience; matched: ${hits.slice(0, 6).join(", ") || "few keywords"}${certs ? "; has certification" : ""}.`, strengths: hits.slice(0, 3), gaps: [] as string[] };
}

/** Module 4 — Automated sourcing & screening. */
export const recruiterAgent: AgentDef = {
  id: "recruiter",
  name: "Recruitment Agent",
  module: "Recruitment & HR",
  description: "Writes job ads + sourcing search strings for Indian job boards/social, screens resumes and runs conversational screening interviews.",
  subscribes: ["job.created", "candidate.added"],
  periodic: false,
  async run({ db, tenant }, ev) {
    if (ev?.type === "job.created") {
      const { data: job } = await db.from("job_postings").select("*").eq("id", ev.payload.job_id as string).single();
      const r = await llmJson<{ naukri: string; apna: string; instagram: string; whatsapp: string; search_strings: string[] }>({
        system: "You are a recruitment agent for Indian salons. Return JSON {naukri, apna, instagram, whatsapp, search_strings[]} — channel-specific job ads (Apna & WhatsApp in simple Hinglish) and boolean search strings for LinkedIn/Naukri/Instagram hashtags.",
        messages: [{ role: "user", content: `Salon ${tenant.name}, ${tenant.city}. Role: ${job.title} (${job.role}). ${job.description ?? ""}. Salary ${job.salary_range ?? "negotiable"}. Location ${job.location ?? tenant.city}.` }],
      }, () => ({
        naukri: `${job.title} — ${tenant.name}, ${job.location ?? tenant.city}. ${job.description ?? ""} Salary: ${job.salary_range ?? "best in industry"} + attractive commission. Apply now.`,
        apna: `${tenant.name} ko chahiye ${job.title}! Salary ${job.salary_range ?? "achhi"} + commission. ${job.location ?? tenant.city}. Abhi apply karein.`,
        instagram: `We're hiring ✂️ ${job.title} at ${tenant.name}, ${tenant.city}! DM us. #salonjobs #hairstylistjobs #${(tenant.city ?? "india").toLowerCase()}jobs #beautyjobs`,
        whatsapp: `Hiring: ${job.title} @ ${tenant.name} (${job.location ?? tenant.city}). Salary ${job.salary_range ?? "negotiable"} + incentives. Reply with your experience.`,
        search_strings: [`("${job.title}" OR stylist OR beautician) AND ${tenant.city}`, `#${job.role}jobs #${(tenant.city ?? "india").toLowerCase()}salon`],
      }));
      await db.from("job_postings").update({ ad_copy: r.data }).eq("id", job.id);
      return { summary: `Generated multi-channel job ads + sourcing strings for "${job.title}".`, actions: [{ type: "job_ads", label: job.title, ref: job.id }], provider: r.provider };
    }
    const { data: c } = await db.from("candidates").select("*, job_postings(title, description, role)").eq("id", ev!.payload.candidate_id as string).single();
    const job = c.job_postings ?? { title: "Stylist", description: "", role: "stylist" };
    const r = await llmJson<{ score: number; summary: string; strengths: string[]; gaps: string[] }>({
      system: "You screen salon job candidates in India. Return JSON {score 0-100, summary (2 sentences), strengths[], gaps[]}. Be fair; ignore gender, religion, caste, age, marital status.",
      messages: [{ role: "user", content: `Job: ${job.title} — ${job.description}\nResume:\n${(c.resume_text ?? "").slice(0, 6000)}` }],
    }, () => ruleScreen(c.resume_text ?? "", job));
    const score = Math.max(0, Math.min(100, Math.round(Number(r.data.score))));
    const status = score >= 70 ? "shortlisted" : score < 40 ? "rejected" : "screening";
    const chat = status === "rejected" ? [] : [{ from: "agent", text: `Hi ${c.name}! Thanks for applying for ${job.title} at ${tenant.name}. A few quick questions. ${SCREEN_QUESTIONS[0]}` }];
    await db.from("candidates").update({ score, summary: `${r.data.summary}${r.data.gaps?.length ? " Gaps: " + r.data.gaps.join(", ") : ""}`, status, screening_chat: chat }).eq("id", c.id);
    return { summary: `Screened ${c.name}: ${score}/100 → ${status}.`, actions: [{ type: "screen", label: `${c.name} ${score}/100 (${status})`, ref: c.id }], provider: r.provider };
  },
};

/** Conversational screening turn (text "voice-agent" equivalent). */
export async function screeningTurn(db: SupabaseClient, tenant: Tenant, candidateId: string, answer: string) {
  const { data: c } = await db.from("candidates").select("*, job_postings(title)").eq("id", candidateId).single();
  const chat = [...(c.screening_chat ?? []), { from: "candidate", text: answer }] as { from: string; text: string }[];
  const asked = chat.filter((m) => m.from === "agent").length;
  let next: string;
  let done = asked >= SCREEN_QUESTIONS.length;
  let provider = "rules-engine";
  const r = await llm({
    system: `You are a friendly screening interviewer for ${tenant.name} hiring a ${c.job_postings?.title ?? "stylist"}. Ask one short question at a time (cover experience, skills, shifts, salary expectation, joining date). Reply in the candidate's language. After ~5 answers, reply with JSON only: {"done":true,"score":0-100,"summary":"..."} . Otherwise reply with just the next question.`,
    messages: chat.map((m) => ({ role: m.from === "agent" ? "assistant" as const : "user" as const, content: m.text })),
  });
  if (r) {
    provider = r.provider;
    const j = extractJson<{ done: boolean; score: number; summary: string }>(r.text);
    if (j?.done) {
      done = true;
      next = `Thank you ${c.name}! We'll get back to you shortly.`;
      await db.from("candidates").update({ score: Math.round((Number(c.score ?? 50) + j.score) / 2), summary: `${c.summary ?? ""}\nInterview: ${j.summary}`, status: j.score >= 65 ? "shortlisted" : "screening" }).eq("id", c.id);
    } else next = r.text;
  } else {
    next = done ? `Thank you ${c.name}! We'll get back to you shortly.` : SCREEN_QUESTIONS[asked];
  }
  chat.push({ from: "agent", text: next });
  await db.from("candidates").update({ screening_chat: chat }).eq("id", c.id);
  return { done, provider };
}

/** Module 4 — Payroll & commission (Indian slab matrices, product cross-sales, tips, penalties). */
export async function computePayroll(db: SupabaseClient, tenantId: string, from: string, to: string) {
  const [{ data: staff }, { data: bookings }, { data: invoices }, { data: adj }] = await Promise.all([
    db.from("staff").select("*").eq("tenant_id", tenantId),
    db.from("bookings").select("staff_id, price").eq("tenant_id", tenantId).eq("status", "completed").gte("start_at", istDate(from, "00:00").toISOString()).lte("start_at", istDate(to, "23:59").toISOString()),
    db.from("invoices").select("items").eq("tenant_id", tenantId).gte("invoice_date", from).lte("invoice_date", to),
    db.from("staff_adjustments").select("*").eq("tenant_id", tenantId).gte("created_at", istDate(from, "00:00").toISOString()).lte("created_at", istDate(to, "23:59").toISOString()),
  ]);
  const lines = ((staff ?? []) as Staff[]).map((st) => {
    const svcRev = (bookings ?? []).filter((b) => b.staff_id === st.id).reduce((s, b) => s + Number(b.price), 0);
    const prodRev = (invoices ?? []).flatMap((i) => i.items as { kind: string; staff_id?: string; taxable_value: number }[]).filter((i) => i.kind === "product" && i.staff_id === st.id).reduce((s, i) => s + Number(i.taxable_value), 0);
    const sum = (k: string) => (adj ?? []).filter((a) => a.staff_id === st.id && a.kind === k).reduce((s, a) => s + Number(a.amount), 0);
    return payrollLine(st, svcRev, prodRev, sum("tip"), sum("penalty"), sum("bonus"));
  });
  return { lines, total: lines.reduce((s, l) => s + l.net, 0) };
}

/** Module 4 — Performance engineering: utilisation + ratings + waste → micro-learning assignments. */
export const performanceAgent: AgentDef = {
  id: "performance",
  name: "Performance Coach Agent",
  module: "Recruitment & HR",
  description: "Monitors stylist utilisation, client ratings and waste flags; assigns targeted micro-learning modules to under-performers.",
  subscribes: ["staff.waste_flag"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: staff }, { data: bookings }, { data: waste }, { data: existing }] = await Promise.all([
      db.from("staff").select("*").eq("tenant_id", tenant.id).eq("active", true),
      db.from("bookings").select("staff_id, start_at, end_at, status, rating").eq("tenant_id", tenant.id).gte("start_at", since).lte("start_at", new Date().toISOString()),
      db.from("usage_logs").select("staff_id").eq("tenant_id", tenant.id).eq("flagged", true).gte("created_at", since),
      db.from("learning_assignments").select("staff_id, module").eq("tenant_id", tenant.id).gte("created_at", since),
    ]);
    const target = ev ? (staff ?? []).filter((s) => s.id === ev.payload.staff_id) : staff ?? [];
    const metrics = target.map((st) => {
      const mine = (bookings ?? []).filter((b) => b.staff_id === st.id && b.status !== "cancelled");
      const bookedMin = mine.filter((b) => b.status === "completed").reduce((s, b) => s + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000, 0);
      const avail = 26 * (timeToMin(st.work_end.slice(0, 5)) - timeToMin(st.work_start.slice(0, 5)));
      const ratings = mine.map((b) => b.rating).filter(Boolean) as number[];
      return {
        staff: st, utilization: Math.round((bookedMin / avail) * 100), avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        wasteFlags: (waste ?? []).filter((w) => w.staff_id === st.id).length, noShows: mine.filter((b) => b.status === "no_show").length,
      };
    });
    const weak = metrics.filter((m) => m.wasteFlags > 0 || (m.avgRating !== null && m.avgRating < 4) || (m.utilization < 35 && (bookings ?? []).length > 10));
    const actions = [];
    let provider = "rules-engine";
    for (const m of weak) {
      const already = new Set((existing ?? []).filter((e) => e.staff_id === m.staff.id).map((e) => e.module));
      const r = await llmJson<{ modules: { module: string; reason: string }[] }>({
        system: `Pick 1-2 micro-learning modules ONLY from this catalogue: ${LEARNING_MODULES.join(" | ")}. Return JSON {modules:[{module, reason}]}. Reason ≤ 20 words, constructive.`,
        messages: [{ role: "user", content: `Stylist ${m.staff.name} (L${m.staff.skill_level}, skills ${m.staff.skills.join(", ")}): utilisation ${m.utilization}%, avg rating ${m.avgRating ?? "n/a"}, waste flags ${m.wasteFlags}, no-shows ${m.noShows}.` }],
      }, () => ({
        modules: [
          ...(m.wasteFlags ? [{ module: "Product dosage & waste control", reason: `${m.wasteFlags} excessive-usage flag(s) in 30 days` }] : []),
          ...(m.avgRating !== null && m.avgRating < 4 ? [{ module: "Client consultation & upselling", reason: `average rating ${m.avgRating}/5` }] : []),
          ...(m.utilization < 35 ? [{ module: "Retail product knowledge", reason: `utilisation only ${m.utilization}%` }] : []),
        ],
      }));
      provider = r.provider;
      for (const x of (r.data.modules ?? []).filter((x) => LEARNING_MODULES.includes(x.module) && !already.has(x.module)).slice(0, 2)) {
        await db.from("learning_assignments").insert({ tenant_id: tenant.id, staff_id: m.staff.id, module: x.module, reason: x.reason });
        actions.push({ type: "learning", label: `${m.staff.name} → "${x.module}" (${x.reason})`, ref: m.staff.id });
      }
    }
    return {
      summary: `Reviewed ${metrics.length} stylist(s); ${actions.length} micro-learning module(s) assigned.`,
      actions, provider, skipLog: !ev && !actions.length && !metrics.length,
      output: metrics.map((m) => ({ name: m.staff.name, utilization: m.utilization, rating: m.avgRating, waste_flags: m.wasteFlags })),
    };
  },
};
