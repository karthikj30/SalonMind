import { NextResponse, type NextRequest } from "next/server";
import { botClient } from "@/lib/supabase/bot";
import { rateLimited, searchMarketplace } from "@/lib/services/marketplace";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many searches — try again in a minute." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const q = String(body.q ?? "").slice(0, 300);
  const image = body.image && typeof body.image.base64 === "string" && body.image.base64.length < 4_500_000 ? { mime: String(body.image.mime || "image/jpeg"), base64: body.image.base64 } : undefined;
  if (!q && !image) return NextResponse.json({ error: "Type what you need or upload a photo." }, { status: 400 });
  try {
    const db = await botClient();
    return NextResponse.json(await searchMarketplace(db, q, image));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
