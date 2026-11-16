import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { interpretVoice } from "@/lib/agents/voice";
import { normalizeTenant } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";
import type { VoiceContext } from "@/lib/domain/voice";
import { rateLimited } from "@/lib/services/marketplace";
import { TENANT_COOKIE } from "@/lib/tenant";

export const maxDuration = 30;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Only the shape the agent needs is kept from what the browser sends (the page description is untrusted input). */
function cleanContext(raw: unknown): VoiceContext {
  const c = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    path: str(c.path, 200),
    forms: arr(c.forms, 20).map((f, i) => ({ index: Number((f as { index?: number })?.index ?? i), title: str((f as { title?: string })?.title, 80), danger: Boolean((f as { danger?: boolean })?.danger) })),
    fields: arr(c.fields, 120).map((f) => {
      const x = f as Record<string, unknown>;
      return { form: Number(x.form ?? 0), name: str(x.name, 60), label: str(x.label, 80), type: str(x.type, 20),
        options: Array.isArray(x.options) ? x.options.slice(0, 40).map((o) => ({ value: str((o as { value?: string })?.value, 80), label: str((o as { label?: string })?.label, 80) })) : undefined };
    }).filter((f) => f.name),
    buttons: arr(c.buttons, 60).map((b) => str(b, 60)).filter(Boolean),
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(`voice:${ip}`, 40)) return NextResponse.json({ error: "Too many commands — wait a moment." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const text = str(body.text, 500).trim();
  if (!text) return NextResponse.json({ error: "Say or type a command." }, { status: 400 });
  const ctx = cleanContext(body.ctx);

  // Signed-in owners get the LLM path, live answers and an entry in the Agent Console; on the sign-in / sign-up
  // pages only the deterministic parser runs (no model calls for anonymous visitors).
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  let tenant: Tenant | undefined;
  if (user) {
    const { data: ms } = await db.from("tenant_members").select("tenant_id").eq("user_id", user.id);
    const wanted = (await cookies()).get(TENANT_COOKIE)?.value;
    const id = ms?.find((m) => m.tenant_id === wanted)?.tenant_id ?? ms?.[0]?.tenant_id;
    if (id) {
      const { data: t } = await db.from("tenants").select("*").eq("id", id).single();
      if (t) tenant = normalizeTenant(t as Tenant);
    }
  }
  try {
    const out = await interpretVoice({ db: tenant ? db : undefined, tenant, text, lang: str(body.lang, 5) || "en", ctx, allowLlm: Boolean(user), skipNav: Boolean(body.skipNav) });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
