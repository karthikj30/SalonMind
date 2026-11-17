import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { translateBatch } from "@/lib/ai/translate";
import { isTLang, sourceHash } from "@/lib/domain/translate";
import { rateLimited } from "@/lib/services/marketplace";
import { TENANT_COOKIE } from "@/lib/tenant";
import { UI_SOURCE } from "@/lib/i18n/app/source";

export const maxDuration = 30;
const ALLOW = new Set(UI_SOURCE);
const HINT = "These are short user-interface labels, buttons and help texts of a salon management web app used by salon owners in India. Keep them short; prefer the words salon owners actually use (loanwords like Booking, Invoice, GST, UPI are fine).";

/**
 * Runtime translation for dashboard strings the hand-made dictionary does not cover yet.
 * Only strings that exist in the app's own source code (allowlist) are translated — nothing a user typed.
 * Signed-in salons cache results in `translations` (private rows), so each string is translated once.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(`ui-i18n:${ip}`, 30)) return NextResponse.json({ t: {} }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const lang = String(body.lang ?? "");
  if (!isTLang(lang) || lang === "en") return NextResponse.json({ t: {} });
  const raw: unknown[] = Array.isArray(body.strings) ? body.strings : [];
  const strings: string[] = [...new Set(raw.map((x) => String(x)))].filter((s) => ALLOW.has(s)).slice(0, 60);
  if (!strings.length) return NextResponse.json({ t: {} });

  const out: Record<string, string> = {};
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  let tenantId: string | null = null;
  if (user) {
    const { data: ms } = await db.from("tenant_members").select("tenant_id").eq("user_id", user.id);
    const wanted = (await cookies()).get(TENANT_COOKIE)?.value;
    tenantId = ms?.find((m) => m.tenant_id === wanted)?.tenant_id ?? ms?.[0]?.tenant_id ?? null;
  }
  if (tenantId) {
    const { data } = await db.from("translations").select("source_text, text").eq("tenant_id", tenantId).eq("lang", lang).in("source_hash", strings.map(sourceHash));
    (data ?? []).forEach((r) => { if (ALLOW.has(r.source_text)) out[r.source_text] = r.text; });
  }
  const missing = strings.filter((s) => !(s in out));
  if (missing.length) {
    const tr = await translateBatch(missing, lang, "en", { hint: HINT });
    const rows: { tenant_id: string; lang: string; source_hash: string; source_text: string; text: string; provider: string; is_public: boolean }[] = [];
    tr.forEach((t, i) => {
      if (t.provider === "none" || t.provider === "same-language") return;
      out[missing[i]] = t.text;
      if (tenantId) rows.push({ tenant_id: tenantId, lang, source_hash: sourceHash(missing[i]), source_text: missing[i], text: t.text, provider: t.provider, is_public: false });
    });
    if (rows.length) await db.from("translations").upsert(rows, { onConflict: "tenant_id,lang,source_hash", ignoreDuplicates: true });
  }
  return NextResponse.json({ t: out });
}
