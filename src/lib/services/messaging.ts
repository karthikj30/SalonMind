import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Outbound messaging. If WhatsApp Cloud API credentials are configured (Meta's free tier) messages are
 * really delivered; otherwise they are recorded as "simulated" so the whole flow is visible in the Inbox.
 */
export async function sendMessage(db: SupabaseClient, m: {
  tenant_id: string; client_id?: string | null; contact_handle?: string | null; phone?: string | null;
  channel: string; body: string; agent: string; meta?: Record<string, unknown>;
}) {
  let status = "simulated";
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (m.channel === "whatsapp" && token && phoneId && m.phone) {
    try {
      const to = m.phone.replace(/\D/g, "").replace(/^0/, "").replace(/^(\d{10})$/, "91$1");
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: m.body } }),
      });
      status = res.ok ? "sent" : "failed";
    } catch {
      status = "failed";
    }
  }
  const { data } = await db.from("messages").insert({
    tenant_id: m.tenant_id, client_id: m.client_id ?? null, contact_handle: m.contact_handle ?? m.phone ?? null,
    channel: m.channel, direction: "out", body: m.body, status, agent: m.agent, meta: m.meta ?? {},
  }).select("id").single();
  return { id: data?.id as string | undefined, status };
}
