/** Pure helpers for the translation gateway (no network): PII masking, script checks, provider language codes. */
import { createHash } from "node:crypto";

export const TRANSLATE_LANGS = ["en", "hi", "bn", "mr", "te", "ta", "gu", "ur", "kn", "or", "ml", "pa", "as"] as const;
export type TLang = (typeof TRANSLATE_LANGS)[number];
export const isTLang = (l: string | null | undefined): l is TLang => (TRANSLATE_LANGS as readonly string[]).includes(l ?? "");

/** Unicode block every language's text must contain (English: none required). */
const SCRIPT: Record<TLang, RegExp | null> = {
  en: null, hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, bn: /[ঀ-৿]/, as: /[ঀ-৿]/, te: /[ఀ-౿]/, ta: /[஀-௿]/,
  gu: /[઀-૿]/, ur: /[؀-ۿ]/, kn: /[ಀ-೿]/, or: /[଀-୿]/, ml: /[ഀ-ൿ]/, pa: /[਀-੿]/,
};
const ANY_INDIC = /[ऀ-ൿ؀-ۿ]/;

/**
 * Quality gate applied to every provider's output: a "Tamil" translation must actually contain Tamil script,
 * an "English" one must not be left in an Indian script, and quota/error banners are rejected.
 */
export function looksTranslated(out: string, to: TLang, source: string): boolean {
  const t = out.trim();
  if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID (SOURCE|TARGET) LANGUAGE|PLEASE SELECT TWO DISTINCT/i.test(t)) return false;
  if (t.length > source.length * 6 + 40) return false; // runaway generation
  const re = SCRIPT[to];
  if (re) return re.test(t) || !/[\p{L}]/u.test(source); // numbers / symbols only → nothing to translate
  return !ANY_INDIC.test(t);
}

/**
 * Replace phone numbers, e-mail addresses, UPI ids and URLs with ⟦n⟧ tokens before text leaves our servers;
 * translators keep the token and `restore` puts the original back. Also protects amounts like ₹1,500.
 */
export function maskPii(text: string): { masked: string; restore: (s: string) => string } {
  const kept: string[] = [];
  const masked = text.replace(/https?:\/\/\S+|upi:\/\/\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)*|\+?\d[\d\s-]{7,}\d/g, (m) => {
    kept.push(m);
    return `⟦${kept.length - 1}⟧`;
  });
  return {
    masked,
    restore: (s) => s.replace(/[⟦\[]\s*(\d+)\s*[⟧\]]/g, (m, i) => kept[Number(i)] ?? m),
  };
}

/** MyMemory accepts ≤ 500 bytes per request: split on sentence ends, keeping each chunk under the limit. */
export function chunkText(text: string, maxBytes = 450): string[] {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  if (bytes(text) <= maxBytes) return [text];
  const parts = text.split(/(?<=[.!?।۔\n])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && bytes(`${cur} ${p}`) > maxBytes) { out.push(cur); cur = ""; }
    if (bytes(p) > maxBytes) { // one very long sentence: hard-split on spaces
      for (const w of p.split(/\s+/)) {
        if (cur && bytes(`${cur} ${w}`) > maxBytes) { out.push(cur); cur = ""; }
        cur = cur ? `${cur} ${w}` : w;
      }
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Target-language tokens of Helsinki-NLP/opus-mt-en-mul (Hugging Face Inference). */
export const OPUS_TOKEN: Record<Exclude<TLang, "en">, string> = {
  hi: "hin", bn: "ben", mr: "mar", te: "tel", ta: "tam", gu: "guj", ur: "urd", kn: "kan", or: "ori", ml: "mal", pa: "pan_Guru", as: "asm",
};

export const sourceHash = (text: string) => createHash("md5").update(text.trim()).digest("hex");
