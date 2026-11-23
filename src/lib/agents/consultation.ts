import "server-only";
import type { Action, AgentDef } from "./types";
import { llmTextIn } from "../ai/translate";
import { sendMessage } from "../services/messaging";
import { latestTestDate, needsPatchTest, patchTestStatus, type PatchTest } from "../domain/consultation";
import { fmtDate, fmtDateTime } from "../time";

/**
 * Consultation & Safety Agent — before every colour / chemical service, checks the client's allergy-alert (patch)
 * test. Missing or out of date → asks the client on WhatsApp to drop in for a 2-minute test at least 48 h before;
 * a test that reacted → warns the salon, never the stylist's memory. Safety rules come from the domain, not a model.
 */
export const consultationAgent: AgentDef = {
  id: "consultation",
  name: "Consultation & Safety Agent",
  module: "CRM & Marketing",
  description: "Checks colour bookings for a valid patch test (≥48 h before, <12 months old), asks clients to come in for one, and flags clients whose last test reacted.",
  subscribes: ["booking.created"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const { data: b } = await db.from("bookings").select("id, client_id, start_at, status, services(name, category), clients(id, name, phone, language)")
      .eq("id", ev!.payload.booking_id as string).eq("tenant_id", tenant.id).maybeSingle();
    const service = b?.services as unknown as { name: string; category: string } | null;
    const client = b?.clients as unknown as { id: string; name: string; phone: string | null; language: string } | null;
    if (!b || !client || !service || !needsPatchTest(service) || !["booked", "confirmed"].includes(b.status)) return { summary: "Not a colour service.", skipLog: true };

    const { data: tests } = await db.from("patch_tests").select("tested_on, result").eq("tenant_id", tenant.id).eq("client_id", client.id);
    const start = new Date(b.start_at);
    const st = patchTestStatus((tests ?? []) as PatchTest[], start);
    const actions: Action[] = [];
    if (st.status === "ok") return { summary: `${client.name}: patch test valid (${fmtDate(st.latest!.tested_on)}) for ${service.name}.`, skipLog: true };

    if (st.status === "failed") {
      actions.push({ type: "safety", label: `⚠ ${client.name}'s last patch test (${fmtDate(st.latest!.tested_on)}) reacted — do not do ${service.name} on ${fmtDateTime(b.start_at)}; offer an alternative.`, ref: b.id });
      if (tenant.phone) {
        await sendMessage(db, { tenant_id: tenant.id, phone: tenant.phone, contact_handle: tenant.phone, channel: "whatsapp", agent: "consultation",
          body: `⚠ Safety check: ${client.name} is booked for ${service.name} on ${fmtDateTime(b.start_at)}, but their last patch test (${fmtDate(st.latest!.tested_on)}) reacted. Please call them to change the service.`,
          meta: { booking_id: b.id, kind: "patch_test_failed" } });
      }
      return { summary: `Flagged ${client.name}: failed patch test before ${service.name}.`, actions };
    }

    if (st.status === "too_soon") {
      return { summary: `${client.name}: patch test on ${fmtDate(st.latest!.tested_on)} is ${st.latest!.result === "pending" ? "awaiting a result" : "less than 48 h before the appointment"}.`,
        actions: [{ type: "safety", label: `Check ${client.name}'s patch test result before ${service.name} (${fmtDateTime(b.start_at)})`, ref: b.id }] };
    }

    // missing or expired → ask the client to come in for a quick test in time
    const by = latestTestDate(start);
    const tooLate = by < new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    if (client.phone && !tooLate) {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("agent", "consultation").contains("meta", { booking_id: b.id });
      if (!count) {
        const m = await llmTextIn(client.language, {
          system: `Write a friendly WhatsApp message (max 40 words) from ${tenant.name}, a salon: before the customer's colour service we need a quick 2-minute skin (patch) test for their safety; ask them to drop in any time before the date given. Do not invent the date — it is added after your text.`,
          messages: [{ role: "user", content: `Customer ${client.name}, service ${service.name}${st.status === "expired" ? ", last test over a year ago" : ""}.` }],
        }, () => `Hi ${client.name}, for your safety we do a quick 2-minute skin test before ${service.name}. Please drop in to ${tenant.name} any time before the date below.`);
        await sendMessage(db, { tenant_id: tenant.id, client_id: client.id, phone: client.phone, contact_handle: client.phone, channel: "whatsapp", agent: "consultation",
          body: `${m.text}\n\n🧪 ${service.name} on ${fmtDateTime(b.start_at)} — skin test by ${fmtDate(by)}`, meta: { booking_id: b.id, kind: "patch_test_request", by } });
        actions.push({ type: "notify", label: `Asked ${client.name} to come for a patch test by ${fmtDate(by)} (${st.status === "expired" ? "last test over 12 months ago" : "no test on file"})`, ref: b.id });
      }
    } else {
      actions.push({ type: "safety", label: `${client.name} has no valid patch test and ${service.name} is under 48 h away — do a test now and reschedule if needed.`, ref: b.id });
    }
    return { summary: `${client.name}: patch test ${st.status} before ${service.name}.`, actions, provider: "rules-engine" };
  },
};
