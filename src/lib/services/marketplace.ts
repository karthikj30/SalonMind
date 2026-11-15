import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, toPgVector } from "../ai/embeddings";
import { extractJson, llm, llmJson } from "../ai/llm";
import { parseIntent, type SearchIntent } from "../domain/intent";
import { planBooking } from "./booking";
import { normalizeTenant } from "../agents/runtime";
import type { Tenant } from "../agents/types";
import { todayIst, toIst } from "../time";

export type SearchResult = {
  tenant: { id: string; name: string; slug: string; city: string | null; description: string | null };
  service: { id: string; name: string; category: string; base_price: number; duration_min: number };
  similarity: number; price: number; deal: { title: string; discount_pct: number } | null;
  slots: { time: string; price: number; staff: string }[]; score: number;
};

/**
 * Consumer discovery engine: natural-language (any Indian language) or photo → structured intent →
 * hybrid retrieval (pgvector similarity + lexical) → hard filters (budget, city) → live slot availability.
 */
export type StyleAdvice = { face_shape: string; styles: { name: string; why: string }[]; query: string };

export async function searchMarketplace(db: SupabaseClient, q: string, image?: { mime: string; base64: string }, mode: "match" | "advisor" = "match") {
  let query = q.trim();
  let visual: string | null = null;
  let advice: StyleAdvice | null = null;
  const trace: string[] = [];
  if (image && mode === "advisor") {
    // Style advisor (idea from open-source face-shape hairstyle recommenders, done with a free vision LLM instead of a custom CV model)
    const r = await llm({
      system: `You are a senior stylist. From the selfie, estimate the face shape (oval, round, square, heart, diamond, oblong) and recommend 3 haircuts/colours that flatter it and suit Indian hair textures. Return JSON {"face_shape":"…","styles":[{"name":"…","why":"≤15 words"}],"query":"salon service keywords to search, ≤8 words"}. Do not comment on attractiveness, age, ethnicity or anything other than face shape and hair.`,
      messages: [{ role: "user", content: q || "Which hairstyles would suit me?" }], image, json: true, temperature: 0.3,
    });
    const j = r ? extractJson<StyleAdvice>(r.text) : null;
    if (j?.styles?.length) { advice = j; query = `${q} ${j.query || j.styles.map((x) => x.name).join(" ")}`.trim(); trace.push(`style advisor (${r!.provider}): ${j.face_shape} face → ${j.styles.map((x) => x.name).join(", ")}`); }
    else trace.push("style advisor: needs a vision-capable free model (GROQ_API_KEY or GEMINI_API_KEY)");
  } else if (image) {
    const r = await llm({
      system: "You are a hairstyle/beauty expert. Describe the look in the photo as a salon service search query (≤20 words): service names (e.g. balayage, layered cut, keratin, bridal makeup, nail art), colour, length, style. Output only the query.",
      messages: [{ role: "user", content: "What salon service would create this look?" }], image,
    });
    if (r) { visual = r.text.trim(); query = `${query} ${visual}`.trim(); trace.push(`vision (${r.provider}): ${visual}`); }
    else trace.push("vision: no vision-capable free model configured (add GROQ_API_KEY or GEMINI_API_KEY)");
  }
  const { data: tenantsAll } = await db.from("tenants").select("*").eq("is_published", true);
  const cities = [...new Set((tenantsAll ?? []).map((t) => t.city).filter(Boolean))] as string[];
  const fallback = parseIntent(query, cities);
  const ext = await llmJson<SearchIntent>({
    system: `Extract a salon search intent. Today is ${todayIst()} (IST). Known cities: ${cities.join(", ") || "none"}. Return JSON {service: short English service keywords, maxPrice: number|null (INR), city: one of the known cities or null, date: YYYY-MM-DD|null, fromTime: HH:MM|null, toTime: HH:MM|null, gender: "men"|"women"|null}. "evening" = 17:00-21:00, "morning" = 09:00-12:00, "afternoon" = 12:00-17:00, "tonight"/"this evening" means today. Translate Hindi/Tamil/etc. to English keywords.`,
    messages: [{ role: "user", content: query }], temperature: 0,
  }, () => fallback);
  const intent: SearchIntent = { ...fallback, ...Object.fromEntries(Object.entries(ext.data).filter(([, v]) => v !== null && v !== "")) } as SearchIntent;
  if (intent.city && !cities.some((c) => c.toLowerCase() === String(intent.city).toLowerCase())) intent.city = null;
  trace.push(`intent (${ext.provider}): ${JSON.stringify(intent)}`);

  // hybrid retrieval
  const e = await embed(intent.service || query);
  const { data: matches } = await db.rpc("match_services", { query_embedding: toPgVector(e.vector), p_model: e.model, match_count: 60 });
  const sim = new Map<string, number>((matches ?? []).map((m: { service_id: string; similarity: number }) => [m.service_id, m.similarity]));
  trace.push(`vector search (${e.model}): ${sim.size} candidates`);
  const { data: services } = await db.from("services").select("id, tenant_id, name, category, description, base_price, duration_min").eq("active", true);
  const words = (intent.service || query).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const { data: deals } = await db.from("deals").select("tenant_id, service_id, title, discount_pct").eq("active", true).gte("valid_to", new Date().toISOString());

  const tmap = new Map((tenantsAll ?? []).map((t) => [t.id, t]));
  let scored = (services ?? []).filter((s) => tmap.has(s.tenant_id)).map((s) => {
    const text = `${s.name} ${s.category} ${s.description ?? ""}`.toLowerCase();
    const lex = words.length ? words.filter((w) => text.includes(w)).length / words.length : 0;
    const v = sim.get(s.id) ?? 0;
    const deal = (deals ?? []).filter((d) => d.tenant_id === s.tenant_id && (!d.service_id || d.service_id === s.id)).sort((a, b) => b.discount_pct - a.discount_pct)[0] ?? null;
    const price = Math.round(Number(s.base_price) * (1 - (deal?.discount_pct ?? 0) / 100));
    return { s, v, lex, deal, price, score: v * 0.6 + lex * 0.6 + (deal ? 0.05 : 0) };
  }).filter((x) => x.lex > 0 || x.v > 0.55);
  if (intent.maxPrice) scored = scored.filter((x) => x.price <= intent.maxPrice!);
  if (intent.city) scored = scored.filter((x) => tmap.get(x.s.tenant_id)?.city?.toLowerCase() === intent.city!.toLowerCase());
  scored.sort((a, b) => b.score - a.score);
  // best service per salon, top 8 salons
  const seen = new Set<string>();
  const top = scored.filter((x) => (seen.has(x.s.tenant_id) ? false : (seen.add(x.s.tenant_id), true))).slice(0, 8);

  const date = intent.date ?? (intent.fromTime ? todayIst() : null);
  const results: SearchResult[] = [];
  for (const x of top) {
    const t = normalizeTenant(tmap.get(x.s.tenant_id) as Tenant);
    let slots: SearchResult["slots"] = [];
    if (date) {
      const plan = await planBooking(db, t, { service_id: x.s.id, date, from: intent.fromTime, to: intent.toTime }, 3).catch(() => null);
      slots = (plan?.slots ?? []).map((sl) => ({ time: toIst(sl.start).time, price: Math.round(sl.quote.price * (1 - (x.deal?.discount_pct ?? 0) / 100)), staff: sl.staff.name }));
      if (intent.maxPrice) slots = slots.filter((sl) => sl.price <= intent.maxPrice!);
    }
    results.push({
      tenant: { id: t.id, name: t.name, slug: t.slug, city: t.city, description: t.description },
      service: { id: x.s.id, name: x.s.name, category: x.s.category, base_price: Number(x.s.base_price), duration_min: x.s.duration_min },
      similarity: Math.round(x.v * 100) / 100, price: x.price, deal: x.deal ? { title: x.deal.title, discount_pct: x.deal.discount_pct } : null,
      slots, score: x.score + (slots.length ? 0.3 : 0),
    });
  }
  if (date) results.sort((a, b) => b.score - a.score);
  trace.push(date ? `availability checked for ${date}${intent.fromTime ? ` ${intent.fromTime}–${intent.toTime}` : ""}` : "no date in query → availability not filtered");
  return { intent, results, trace, visual, date, advice };
}

/** Simple per-IP rate limiter for public AI endpoints (best effort, per serverless instance). */
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}
