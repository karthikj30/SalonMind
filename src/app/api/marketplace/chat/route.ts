import { NextResponse, type NextRequest } from "next/server";
import { botClient } from "@/lib/supabase/bot";
import { receiveMessage } from "@/lib/agents/crm";
import { normalizeTenant, processEvents } from "@/lib/agents/runtime";
import { rateLimited } from "@/lib/services/marketplace";
import type { Tenant } from "@/lib/agents/types";

export const maxDuration = 60;

/** Public web-chat with a salon's AI concierge (same agent as WhatsApp/Instagram). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip, 15)) return NextResponse.json({ error: "Slow down a little 🙂" }, { status: 429 });
  const { slug, handle, name, message } = await req.json();
  if (!slug || !handle || !message) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  const db = await botClient();
  const { data: t } = await db.from("tenants").select("*").eq("slug", slug).eq("is_published", true).single();
  if (!t) return NextResponse.json({ error: "salon not found" }, { status: 404 });
  const tenant = normalizeTenant(t as Tenant);
  const since = new Date().toISOString();
  await receiveMessage(db, tenant.id, { channel: "web", handle: String(handle).slice(0, 40), body: String(message).slice(0, 1000), name: name ? String(name).slice(0, 60) : null });
  await processEvents(db, tenant, 5);
  const { data: replies } = await db.from("messages").select("body, created_at").eq("tenant_id", tenant.id).eq("contact_handle", String(handle).replace(/\s/g, "")).eq("direction", "out").gte("created_at", since).order("created_at");
  return NextResponse.json({ replies: (replies ?? []).map((r) => r.body) });
}
