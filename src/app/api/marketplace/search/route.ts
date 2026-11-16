import { NextResponse, type NextRequest } from "next/server";
import { botClient } from "@/lib/supabase/bot";
import { rateLimited, searchMarketplace } from "@/lib/services/marketplace";
import { loadTranslations } from "@/lib/agents/i18n";
import { LANG_COOKIE } from "@/lib/i18n/ui";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many searches — try again in a minute." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const q = String(body.q ?? "").slice(0, 300);
  const image = body.image && typeof body.image.base64 === "string" && body.image.base64.length < 4_500_000 ? { mime: String(body.image.mime || "image/jpeg"), base64: body.image.base64 } : undefined;
  if (body.mode === "advisor" && !image) return NextResponse.json({ error: "Upload a selfie for style advice." }, { status: 400 });
  if (!q && !image) return NextResponse.json({ error: "Type what you need or upload a photo." }, { status: 400 });
  try {
    const db = await botClient();
    const out = await searchMarketplace(db, q, image, body.mode === "advisor" ? "advisor" : "match");
    const lang = req.cookies.get(LANG_COOKIE)?.value ?? "en";
    if (lang !== "en" && out.results.length) { // show the menu in the visitor's language (stored translations)
      const L = await loadTranslations(db, [...new Set(out.results.map((r) => r.tenant.id))], lang);
      for (const r of out.results) { r.service.name = L(r.service.name); if (r.deal) r.deal.title = L(r.deal.title); }
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
