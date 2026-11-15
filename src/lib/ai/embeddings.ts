import "server-only";
import { Embeddings } from "@langchain/core/embeddings";

export const EMBED_DIM = 768;

/** Which embedding space is active. Services are re-indexed when this changes. */
export function embeddingModel(): string {
  return process.env.GEMINI_API_KEY ? "gemini-embedding-001@768" : "local-hash-v1";
}

/**
 * Local, zero-cost fallback embedding: feature-hashed word unigrams/bigrams + char trigrams,
 * L2-normalised into 768 dims. Captures lexical similarity (good enough for "balayage" ≈ "balayage
 * highlights") and keeps pgvector search working with no API key at all.
 */
export function localEmbed(text: string): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  const norm = text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = norm.split(/\s+/).filter((w) => w.length > 1);
  const add = (tok: string, w: number) => {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) h = Math.imul(h ^ tok.charCodeAt(i), 16777619);
    const idx = Math.abs(h) % EMBED_DIM;
    v[idx] += (h & 1 ? 1 : -1) * w;
  };
  words.forEach((w, i) => {
    add("w:" + w, 1.0);
    if (i > 0) add("b:" + words[i - 1] + "_" + w, 0.7);
    const padded = `#${w}#`;
    for (let j = 0; j < padded.length - 2; j++) add("c:" + padded.slice(j, j + 3), 0.35);
  });
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}

/** LangChain `Embeddings` implementations so retrieval plugs into any LangChain vector-store / retriever. */
export class LocalHashEmbeddings extends Embeddings {
  constructor() { super({}); }
  async embedDocuments(texts: string[]) { return texts.map(localEmbed); }
  async embedQuery(text: string) { return localEmbed(text); }
}

/** Gemini `gemini-embedding-001` truncated to 768 dims (pgvector column size) via outputDimensionality. */
export class GeminiEmbeddings extends Embeddings {
  constructor(private apiKey: string) { super({ maxRetries: 1 }); }
  async embedQuery(text: string) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: EMBED_DIM }),
      signal: AbortSignal.timeout(15_000),
    });
    const values: number[] | undefined = (await res.json())?.embedding?.values;
    if (!res.ok || values?.length !== EMBED_DIM) throw new Error(`gemini embedding failed (${res.status})`);
    const mag = Math.sqrt(values.reduce((a, x) => a + x * x, 0)) || 1;
    return values.map((x) => x / mag);
  }
  async embedDocuments(texts: string[]) { return Promise.all(texts.map((t) => this.embedQuery(t))); }
}

export async function embed(text: string): Promise<{ vector: number[]; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    try {
      return { vector: await new GeminiEmbeddings(key).embedQuery(text), model: "gemini-embedding-001@768" };
    } catch (e) {
      console.warn("[embed] gemini failed", (e as Error).message);
    }
  }
  return { vector: await new LocalHashEmbeddings().embedQuery(text), model: "local-hash-v1" };
}

export const toPgVector = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;
