import "server-only";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

/**
 * Unified LLM abstraction layer built on **LangChain.js** (RFP §4 "AI / LLM Layer").
 *
 * Every agent talks to `llm()` / `llmJson()` / `llmText()`; underneath, each provider is a LangChain
 * `BaseChatModel`, so the chain is provider-agnostic and providers can be swapped by env var.
 *
 * Order (first healthy model wins; the rest are fallbacks):
 *   free   1. Groq           — gpt-oss-120b, then Qwen3, then gpt-oss-20b (Whisper for STT) GROQ_API_KEY
 *   free   2. Google Gemini  — Gemini 2.5 Flash (vision)                   GEMINI_API_KEY
 *   free   3. OpenRouter     — ":free" models (OpenAI-compatible)          OPENROUTER_API_KEY
 *   free   4. Hugging Face   — Inference Providers router                  HF_TOKEN
 *   free   5. Ollama         — local open models                           OLLAMA_BASE_URL
 *   paid   6. OpenAI GPT     — optional, only if you add a key              OPENAI_API_KEY
 *   paid   7. Anthropic Claude — optional, only if you add a key            ANTHROPIC_API_KEY
 *          8. Rules engine   — deterministic fallback inside each agent (callers handle `null`)
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

export type Provider = {
  name: string;
  tier: "free" | "paid";
  vision: boolean;
  enabled: () => boolean;
  model: (o: { temperature: number; maxTokens: number; image: boolean; json: boolean }) => BaseChatModel;
  label: (image: boolean) => string;
};

const oaCompat = (name: string, baseURL: string, keyEnv: string | null, modelEnv: string, fallbackModel: string): Provider => ({
  name, tier: "free", vision: false,
  enabled: () => (keyEnv ? !!process.env[keyEnv] : !!process.env.OLLAMA_BASE_URL),
  label: () => process.env[modelEnv] || fallbackModel,
  model: ({ temperature, maxTokens }) => new ChatOpenAI({
    model: process.env[modelEnv] || fallbackModel, temperature, maxTokens, maxRetries: 0,
    apiKey: keyEnv ? process.env[keyEnv] : "ollama",
    configuration: { baseURL: name === "ollama" ? `${process.env.OLLAMA_BASE_URL}/v1` : baseURL },
  }),
});

const isReasoning = (m: string) => /gpt-oss|deepseek-r1|qwq/i.test(m);
const groqProvider = (name: string, textModel: () => string): Provider => ({
  name, tier: "free", vision: !!process.env.GROQ_VISION_MODEL, enabled: () => !!process.env.GROQ_API_KEY,
  label: (img) => (img ? process.env.GROQ_VISION_MODEL! : textModel()),
  model: ({ temperature, maxTokens, image }) => {
    const model = image ? process.env.GROQ_VISION_MODEL! : textModel();
    const reasoning = isReasoning(model);
    return new ChatGroq({
      model, apiKey: process.env.GROQ_API_KEY, temperature, maxRetries: 0,
      maxTokens: reasoning ? maxTokens + 600 : maxTokens,
      ...(reasoning ? { reasoningEffort: "low" as const } : {}),
    });
  },
});

export const PROVIDERS: Provider[] = [
  // Groq (free). Defaults follow the models Groq serves today; override with GROQ_MODEL / GROQ_FALLBACK_MODEL /
  // GROQ_VISION_MODEL. gpt-oss models reason before answering, so they get low effort + extra token headroom
  // (otherwise a short reply can run out of tokens while still "thinking" and come back empty).
  groqProvider("groq", () => process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
  groqProvider("groq", () => process.env.GROQ_FALLBACK_MODEL || "qwen/qwen3.8-27b"),
  // Each Groq model has its own free per-minute token budget (8,000 tokens/min today), so a third model gives a
  // burst of agent calls more room before anything falls back to the rules engine.
  groqProvider("groq", () => process.env.GROQ_FALLBACK2_MODEL || "openai/gpt-oss-20b"),
  {
    name: "gemini", tier: "free", vision: true, enabled: () => !!process.env.GEMINI_API_KEY,
    label: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
    model: ({ temperature, maxTokens, json }) => new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash", apiKey: process.env.GEMINI_API_KEY, temperature,
      maxOutputTokens: maxTokens, maxRetries: 0, json, thinkingConfig: { thinkingBudget: 0 },
    }),
  },
  oaCompat("openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
  oaCompat("huggingface", "https://router.huggingface.co/v1", "HF_TOKEN", "HF_MODEL", "meta-llama/Llama-3.3-70B-Instruct"),
  oaCompat("ollama", "", null, "OLLAMA_MODEL", "llama3.2"),
  {
    name: "openai", tier: "paid", vision: true, enabled: () => !!process.env.OPENAI_API_KEY,
    label: () => process.env.OPENAI_MODEL || "gpt-4o-mini",
    model: ({ temperature, maxTokens }) => new ChatOpenAI({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY, temperature, maxTokens, maxRetries: 0 }),
  },
  {
    name: "anthropic", tier: "paid", vision: true, enabled: () => !!process.env.ANTHROPIC_API_KEY,
    label: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    // Current Claude models reject sampling params (temperature/top_p) and always think, so no temperature
    // and a roomier max_tokens than the free providers.
    model: ({ maxTokens }) => new ChatAnthropic({ model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5", apiKey: process.env.ANTHROPIC_API_KEY, maxTokens: Math.max(maxTokens, 8000), maxRetries: 0 }),
  },
];

/** Convert our provider-neutral messages to LangChain messages (image attached to the last user turn). */
export function toLangChain(o: Pick<Opts, "system" | "messages" | "image">): BaseMessage[] {
  const out: BaseMessage[] = [];
  if (o.system) out.push(new SystemMessage(o.system));
  o.messages.forEach((m, i) => {
    if (m.role === "assistant") return void out.push(new AIMessage(m.content));
    if (o.image && i === o.messages.length - 1) {
      out.push(new HumanMessage({ content: [{ type: "text", text: m.content }, { type: "image_url", image_url: { url: `data:${o.image.mime};base64,${o.image.base64}` } }] }));
    } else out.push(new HumanMessage(m.content));
  });
  return out;
}

const textOf = (content: unknown): string =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("") : "";

/**
 * Run a LangChain fallback chain: try each model in order until one returns non-empty text.
 * (Equivalent to `model.withFallbacks()`, but records which provider answered for the audit log.)
 */
export async function runChain(models: { name: string; model: BaseChatModel }[], messages: BaseMessage[], timeoutMs = TIMEOUT_MS): Promise<LlmResult | null> {
  for (const m of models) {
    try {
      const res = await m.model.invoke(messages, { signal: AbortSignal.timeout(timeoutMs) });
      const text = textOf(res.content).trim();
      if (text) return { text, provider: m.name };
    } catch (e) {
      console.warn(`[llm] ${m.name} failed:`, (e as Error).message?.slice(0, 200));
    }
  }
  return null;
}

export function providerStatus() {
  return PROVIDERS.map((p) => ({ name: p.name, tier: p.tier, configured: p.enabled(), vision: p.vision }));
}

export function aiEnabled() {
  return PROVIDERS.some((p) => p.enabled());
}

/** Returns null when no provider is configured or all failed → caller uses its rules-engine fallback. */
export async function llm(o: Opts): Promise<LlmResult | null> {
  const cfg = { temperature: o.temperature ?? 0.4, maxTokens: o.maxTokens ?? 900, image: !!o.image, json: !!o.json };
  const chain = PROVIDERS.filter((p) => p.enabled() && (!o.image || p.vision))
    .map((p) => ({ name: `${p.name}/${p.label(cfg.image)}`, model: p.model(cfg) }));
  if (!chain.length) return null;
  const system = o.json ? `${o.system ?? ""}\nRespond with a single valid JSON object only — no prose, no code fences.`.trim() : o.system;
  return runChain(chain, toLangChain({ system, messages: o.messages, image: o.image }));
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
  or: "Odia",
  ur: "Urdu",
  as: "Assamese",
};
