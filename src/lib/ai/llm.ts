import "server-only";

/**
 * Unified LLM abstraction layer — free-tier providers only.
 *
 * Order of preference (first configured + healthy provider wins, the rest are fallbacks):
 *   1. Groq          — Llama 3.3 70B (free tier, very fast)          GROQ_API_KEY
 *   2. Google Gemini — Gemini 2.5 Flash (free tier, vision + embed)  GEMINI_API_KEY
 *   3. OpenRouter    — any ":free" model                             OPENROUTER_API_KEY
 *   4. Hugging Face  — Inference Providers router (free credits)     HF_TOKEN
 *   5. Ollama        — fully local open models for development       OLLAMA_BASE_URL
 *   6. Rules engine  — deterministic fallback inside each agent (callers handle `null`)
 */

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type LlmImage = { mime: string; base64: string };
export type LlmResult = { text: string; provider: string };

type Opts = {
  system?: string;
  messages: ChatMsg[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  image?: LlmImage;
};

const TIMEOUT_MS = 25_000;

async function fetchJson(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

function openAiMessages(o: Opts) {
  const msgs: unknown[] = [];
  if (o.system) msgs.push({ role: "system", content: o.system });
  o.messages.forEach((m, i) => {
    const isLastUser = i === o.messages.length - 1 && m.role === "user";
    if (o.image && isLastUser) {
      msgs.push({
        role: "user",
        content: [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: `data:${o.image.mime};base64,${o.image.base64}` } },
        ],
      });
    } else msgs.push(m);
  });
  return msgs;
}

async function openAiCompatible(name: string, url: string, key: string | undefined, model: string, o: Opts): Promise<LlmResult> {
  const body: Record<string, unknown> = {
    model,
    messages: openAiMessages(o),
    temperature: o.temperature ?? 0.4,
    max_tokens: o.maxTokens ?? 900,
  };
  if (o.json) body.response_format = { type: "json_object" };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  const data = await fetchJson(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty completion");
  return { text, provider: `${name}/${model}` };
}

async function gemini(o: Opts): Promise<LlmResult> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const contents = o.messages.map((m, i) => {
    const parts: unknown[] = [{ text: m.content }];
    if (o.image && i === o.messages.length - 1) parts.push({ inline_data: { mime_type: o.image.mime, data: o.image.base64 } });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: o.temperature ?? 0.4,
      maxOutputTokens: o.maxTokens ?? 900,
      ...(o.json ? { responseMimeType: "application/json" } : {}),
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error("empty completion");
  return { text, provider: `gemini/${model}` };
}

type Provider = { name: string; enabled: () => boolean; vision: boolean; call: (o: Opts) => Promise<LlmResult> };

const PROVIDERS: Provider[] = [
  {
    name: "groq",
    enabled: () => !!process.env.GROQ_API_KEY,
    vision: true,
    call: (o) =>
      openAiCompatible(
        "groq",
        "https://api.groq.com/openai/v1/chat/completions",
        process.env.GROQ_API_KEY,
        o.image
          ? process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"
          : process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        o,
      ),
  },
  { name: "gemini", enabled: () => !!process.env.GEMINI_API_KEY, vision: true, call: gemini },
  {
    name: "openrouter",
    enabled: () => !!process.env.OPENROUTER_API_KEY,
    vision: false,
    call: (o) =>
      openAiCompatible(
        "openrouter",
        "https://openrouter.ai/api/v1/chat/completions",
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        o,
      ),
  },
  {
    name: "huggingface",
    enabled: () => !!process.env.HF_TOKEN,
    vision: false,
    call: (o) =>
      openAiCompatible(
        "huggingface",
        "https://router.huggingface.co/v1/chat/completions",
        process.env.HF_TOKEN,
        process.env.HF_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
        o,
      ),
  },
  {
    name: "ollama",
    enabled: () => !!process.env.OLLAMA_BASE_URL,
    vision: false,
    call: (o) =>
      openAiCompatible("ollama", `${process.env.OLLAMA_BASE_URL}/v1/chat/completions`, undefined, process.env.OLLAMA_MODEL || "llama3.2", o),
  },
];

export function providerStatus() {
  return PROVIDERS.map((p) => ({ name: p.name, configured: p.enabled(), vision: p.vision }));
}

export function aiEnabled() {
  return PROVIDERS.some((p) => p.enabled());
}

/** Returns null when no provider is configured or all failed → caller uses its rules-engine fallback. */
export async function llm(o: Opts): Promise<LlmResult | null> {
  for (const p of PROVIDERS) {
    if (!p.enabled() || (o.image && !p.vision)) continue;
    try {
      return await p.call(o);
    } catch (e) {
      console.warn(`[llm] ${p.name} failed:`, (e as Error).message);
    }
  }
  return null;
}

export function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** JSON-mode completion with a deterministic fallback. Always returns a value + which engine produced it. */
export async function llmJson<T>(o: Omit<Opts, "json">, fallback: () => T): Promise<{ data: T; provider: string }> {
  const r = await llm({ ...o, json: true });
  if (r) {
    const parsed = extractJson<T>(r.text);
    if (parsed) return { data: parsed, provider: r.provider };
  }
  return { data: fallback(), provider: "rules-engine" };
}

export async function llmText(o: Opts, fallback: () => string): Promise<{ text: string; provider: string }> {
  const r = await llm(o);
  if (r) return { text: r.text.trim(), provider: r.provider };
  return { text: fallback(), provider: "rules-engine" };
}

export const LANGUAGES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  mr: "Marathi",
  kn: "Kannada",
  ml: "Malayalam",
  gu: "Gujarati",
  pa: "Punjabi",
};
