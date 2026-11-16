import { NextResponse, type NextRequest } from "next/server";
import { rateLimited } from "@/lib/services/marketplace";

export const maxDuration = 30;
const MAX_BYTES = 3_500_000; // ~60 s of compressed speech; Vercel's request limit is 4.5 MB
const LANGS = new Set(["en", "hi", "bn", "mr", "te", "ta", "gu", "ur", "kn", "ml", "pa", "as", "or"]);

/**
 * Server speech-to-text for browsers without built-in recognition (e.g. Firefox). Free providers:
 *   1. Groq  whisper-large-v3-turbo        (GROQ_API_KEY)
 *   2. Hugging Face Inference, openai/whisper-large-v3-turbo (HF_TOKEN)
 * Audio is streamed to the provider and never stored.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(`stt:${ip}`, 12)) return NextResponse.json({ error: "Too many voice requests — wait a moment." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return NextResponse.json({ error: "No audio received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Recording too long — keep it under a minute." }, { status: 413 });
  const lang = String(form?.get("lang") ?? "en").slice(0, 2);
  const errors: string[] = [];

  if (process.env.GROQ_API_KEY) {
    try {
      const fd = new FormData();
      fd.set("file", audio, "speech.webm");
      fd.set("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
      if (LANGS.has(lang)) fd.set("language", lang);
      fd.set("response_format", "json");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: fd, signal: AbortSignal.timeout(25_000) });
      if (r.ok) return NextResponse.json({ text: String((await r.json()).text ?? "").trim(), provider: "groq/whisper-large-v3-turbo" });
      errors.push(`groq ${r.status}`);
    } catch (e) { errors.push(`groq ${(e as Error).message}`); }
  }
  if (process.env.HF_TOKEN) {
    try {
      const r = await fetch("https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo", {
        method: "POST", headers: { authorization: `Bearer ${process.env.HF_TOKEN}`, "content-type": audio.type || "audio/webm" },
        body: audio, signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) return NextResponse.json({ text: String((await r.json()).text ?? "").trim(), provider: "huggingface/whisper-large-v3-turbo" });
      errors.push(`huggingface ${r.status}`);
    } catch (e) { errors.push(`huggingface ${(e as Error).message}`); }
  }
  return NextResponse.json({
    error: errors.length ? `Speech-to-text failed (${errors.join("; ")}). You can type the command instead.`
      : "This browser has no built-in speech recognition and no server speech-to-text is configured. Add a free GROQ_API_KEY or HF_TOKEN, use Chrome / Edge / Safari, or type the command.",
  }, { status: errors.length ? 502 : 501 });
}
