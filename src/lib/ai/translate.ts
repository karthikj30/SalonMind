import "server-only";
import { detectLang } from "../i18n/concierge";
import { chunkText, isTLang, looksTranslated, maskPii, OPUS_TOKEN, type TLang } from "../domain/translate";
import { aiEnabled, LANGUAGES, llmJson, llmText } from "./llm";

/**
 * Translation gateway for English + 12 Indian languages. Free providers, tried in order:
 *   1. the LLM gateway (Groq / Gemini / OpenRouter / Hugging Face router …) when any key is configured — batched, context-aware
 *   2. MyMemory public API — no key needed (≈5,000 characters/day per server IP)
 *   3. Hugging Face Inference, Helsinki-NLP opus-mt (needs HF_TOKEN) — pivots through English for Indic↔Indic
 *   4. give up: the original text is returned with provider "none"
 * Every output passes `looksTranslated` (right script, no quota banner) or the next provider is tried.
 * Phone numbers, e-mails, UPI ids and links are masked before any text leaves the server.
 */
export type Translation = { text: string; provider: string };

const TIMEOUT = 9000;
const cache = new Map<string, Translation>(); // per server instance; durable storage is the `translations` table
const remember = (k: string, v: Translation) => { if (cache.size > 2000) cache.clear(); cache.set(k, v); return v; };

async function viaLlm(texts: string[], to: TLang, hint?: string): Promise<(string | null)[]> {
  if (!aiEnabled()) return texts.map(() => null);
  const r = await llmJson<{ t: string[] }>({
    system: `You are a professional translator for Indian languages. Translate every string of the JSON array into ${LANGUAGES[to] ?? to}${to === "en" ? "" : " in its native script"}. Rules: keep brand and people names, ₹ amounts, numbers, dates, times and tokens like ⟦0⟧ exactly as they are; for salon terms use the word customers actually say (often a transliteration, e.g. facial, balayage, keratin); natural, polite, concise; do not add or drop information.${hint ? ` ${hint}` : ""} Return only JSON {"t": [...]} with the same number of items in the same order.`,
    messages: [{ role: "user", content: JSON.stringify(texts) }], temperature: 0.1,
  }, () => ({ t: [] }));
  const out = Array.isArray(r.data?.t) && r.data.t.length === texts.length ? r.data.t : [];
  return texts.map((_, i) => (typeof out[i] === "string" ? out[i] : null)).map((x) => (x === null ? null : `${x}\u0000${r.provider}`));
}

async function myMemory(text: string, from: TLang, to: TLang): Promise<string | null> {
  const parts: string[] = [];
  for (const chunk of chunkText(text)) {
    try {
      const de = process.env.MYMEMORY_EMAIL ? `&de=${encodeURIComponent(process.env.MYMEMORY_EMAIL)}` : "";
      const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}${de}`;
      const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) return null;
      const d = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
      const t = d.responseData?.translatedText;
      if (Number(d.responseStatus) !== 200 || !t || !looksTranslated(t, to, chunk)) return null;
      parts.push(t);
    } catch { return null; }
  }
  return parts.join(" ");
}

async function opus(model: string, input: string): Promise<string | null> {
  const token = process.env.HF_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ inputs: input }), signal: AbortSignal.timeout(TIMEOUT * 2),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { translation_text?: string }[] | { translation_text?: string };
    return (Array.isArray(d) ? d[0]?.translation_text : d.translation_text) ?? null;
  } catch { return null; }
}
async function huggingFace(text: string, from: TLang, to: TLang): Promise<string | null> {
  const en = from === "en" ? text : await opus("Helsinki-NLP/opus-mt-mul-en", text);
  if (!en) return null;
  if (to === "en") return en;
  return opus("Helsinki-NLP/opus-mt-en-mul", `>>${OPUS_TOKEN[to]}<< ${en}`);
}

/** Translate several strings into one language. `from` defaults to script detection per string. */
export async function translateBatch(texts: string[], to: string, from?: string | null, opts: { hint?: string } = {}): Promise<Translation[]> {
  if (!isTLang(to)) return texts.map((text) => ({ text, provider: "none" }));
  const result: (Translation | null)[] = texts.map(() => null);
  const jobs: { i: number; src: TLang; masked: string; restore: (s: string) => string; key: string }[] = [];
  texts.forEach((raw, i) => {
    const text = raw?.trim() ?? "";
    const src = isTLang(from) ? from : (detectLang(text) as TLang);
    const key = `${to}:${text}`;
    if (!text || src === to || !/\p{L}/u.test(text)) result[i] = { text: raw, provider: "same-language" };
    else if (cache.has(key)) result[i] = cache.get(key)!;
    else jobs.push({ i, src, key, ...maskPii(text) });
  });
  if (!jobs.length) return result as Translation[];

  const llm = await viaLlm(jobs.map((j) => j.masked), to, opts.hint).catch(() => jobs.map(() => null));
  // fall back per string, four at a time (keyless APIs take one string per request)
  let next = 0;
  const worker = async () => {
    for (let n = next++; n < jobs.length; n = next++) {
      const j = jobs[n];
      const [t, provider] = (llm[n] ?? "").split("\u0000");
      if (t && looksTranslated(t, to, j.masked)) { result[j.i] = remember(j.key, { text: j.restore(t), provider }); continue; }
      const mm = await myMemory(j.masked, j.src, to);
      if (mm) { result[j.i] = remember(j.key, { text: j.restore(mm), provider: "mymemory" }); continue; }
      const hf = await huggingFace(j.masked, j.src, to);
      if (hf && looksTranslated(hf, to, j.masked)) { result[j.i] = remember(j.key, { text: j.restore(hf), provider: "huggingface/opus-mt" }); continue; }
      result[j.i] = { text: texts[j.i], provider: "none" };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  return result as Translation[];
}

export async function translate(text: string, to: string, from?: string | null): Promise<Translation> {
  return (await translateBatch([text], to, from))[0];
}

/**
 * llmText for customer-facing messages: when no LLM is configured the English rules-engine template is
 * translated into the customer's language, so campaigns and nudges are still in their own script.
 */
export async function llmTextIn(lang: string | null | undefined, o: Parameters<typeof llmText>[0], fallback: () => string) {
  const r = await llmText(o, fallback);
  if (r.provider !== "rules-engine" || !lang || lang === "en" || !isTLang(lang)) return r;
  const t = await translate(r.text, lang, "en");
  return t.provider === "none" || t.provider === "same-language" ? r : { text: t.text, provider: `rules-engine+${t.provider}` };
}

/**
 * Translate a sentence while keeping some terms (client / service / product names) on the server: each term is
 * swapped for a ⟦100+i⟧ token before the text is sent out and put back afterwards. null = no provider answered.
 */
export async function translateKeeping(text: string, to: string, keep: string[]): Promise<Translation | null> {
  const terms = [...new Set(keep.map((k) => k?.trim()).filter((k): k is string => !!k && k.length > 1))].sort((a, b) => b.length - a.length);
  let masked = text;
  terms.forEach((t, i) => { masked = masked.split(t).join(`⟦${100 + i}⟧`); });
  const r = await translate(masked, to, "en");
  if (r.provider === "none" || r.provider === "same-language") return null;
  const out = r.text.replace(/[⟦\[]\s*(\d+)\s*[⟧\]]/g, (m, n) => terms[Number(n) - 100] ?? m);
  return { text: out, provider: r.provider };
}
