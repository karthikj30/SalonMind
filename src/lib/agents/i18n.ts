import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDef, Tenant } from "./types";
import { translateBatch } from "../ai/translate";
import { aiEnabled, LANGUAGES } from "../ai/llm";
import { detectLang } from "../i18n/concierge";
import { sourceHash, TRANSLATE_LANGS, type TLang } from "../domain/translate";

/** Everything a consumer reads about a salon: description, service menu and live deals. */
export async function catalogueStrings(db: SupabaseClient, tenant: Tenant): Promise<string[]> {
  const [{ data: services }, { data: deals }] = await Promise.all([
    db.from("services").select("name, description").eq("tenant_id", tenant.id).eq("active", true),
    db.from("deals").select("title, description").eq("tenant_id", tenant.id).eq("active", true).gte("valid_to", new Date().toISOString()),
  ]);
  const all = [tenant.description, ...(services ?? []).flatMap((s) => [s.name, s.description]), ...(deals ?? []).flatMap((d) => [d.title, d.description])];
  return [...new Set(all.map((x) => (x ?? "").trim()).filter((x) => x && /\p{L}/u.test(x)))];
}

/**
 * Translator Agent — keeps the salon's public catalogue available in English + 12 Indian languages.
 * Languages the salon's own clients speak come first; each run has a budget so free API quotas last.
 * Translations are stored (table `translations`), so consumer pages never wait on a translation API.
 */
export const translatorAgent: AgentDef = {
  id: "translator",
  name: "Translator Agent",
  module: "Platform",
  description: "Translates the service menu, salon description and deals into 12 Indian languages (free LLM → MyMemory → Hugging Face) and stores them for the marketplace and salon page.",
  subscribes: ["catalogue.changed"],
  periodic: true,
  async run({ db, tenant, trigger }) {
    const strings = await catalogueStrings(db, tenant);
    if (!strings.length) return { summary: "Nothing to translate yet — add services first.", skipLog: true };
    const { data: have, error } = await db.from("translations").select("lang, source_hash").eq("tenant_id", tenant.id).eq("is_public", true);
    if (error) return { summary: "Translation table missing — apply supabase/migrations/0008_translations.sql.", skipLog: true };
    const done = new Set((have ?? []).map((r) => `${r.lang}:${r.source_hash}`));

    // priority: salon default language, then languages of its clients (most common first), then the rest
    const { data: clients } = await db.from("clients").select("language").eq("tenant_id", tenant.id).limit(2000);
    const counts = new Map<string, number>();
    (clients ?? []).forEach((c) => counts.set(c.language, (counts.get(c.language) ?? 0) + 1));
    const order = [tenant.settings.default_language, ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l), "hi", ...TRANSLATE_LANGS]
      .filter((l, i, a): l is TLang => (TRANSLATE_LANGS as readonly string[]).includes(l) && a.indexOf(l) === i);

    // budget per run: background runs stay short (they share a request with other work); "Run now" does it all.
    // Characters are capped too so the keyless API's daily allowance is spread over the day.
    const t0 = Date.now();
    const deadline = trigger === "manual" ? 30_000 : trigger === "schedule" ? 8_000 : 4_000;
    let charBudget = aiEnabled() ? 20_000 : trigger === "manual" ? 2_500 : 1_200;
    const written: Record<string, number> = {};
    const providers = new Set<string>();
    let remaining = 0;
    const todo = order.map((lang) => ({ lang, missing: strings.filter((s) => detectLang(s) !== lang && !done.has(`${lang}:${sourceHash(s)}`)) })).filter((x) => x.missing.length);
    for (let g = 0; g < todo.length; g += 3) {
      const group = todo.slice(g, g + 3).map(({ lang, missing }, k) => {
        const batch: string[] = [];
        // fair share: every language still to do gets an equal slice of what is left, shortest texts first
        // (service names before long descriptions), so no language is starved by the ones before it
        let share = charBudget / (todo.length - g - k);
        if (Date.now() - t0 < deadline) for (const s of [...missing].sort((x, y) => x.length - y.length)) { if (share - s.length >= 0) { batch.push(s); share -= s.length; charBudget -= s.length; } }
        remaining += missing.length - batch.length;
        return { lang, batch };
      }).filter((x) => x.batch.length);
      await Promise.all(group.map(async ({ lang, batch }) => {
        const out = await translateBatch(batch, lang);
        const rows = out.map((t, i) => ({ t, src: batch[i] })).filter((x) => x.t.provider !== "none" && x.t.provider !== "same-language")
          .map((x) => ({ tenant_id: tenant.id, lang, source_hash: sourceHash(x.src), source_text: x.src, text: x.t.text, provider: x.t.provider, is_public: true }));
        remaining += batch.length - rows.length;
        if (!rows.length) return;
        await db.from("translations").upsert(rows, { onConflict: "tenant_id,lang,source_hash" });
        written[lang] = rows.length;
        rows.forEach((r) => providers.add(r.provider));
      }));
    }
    const n = Object.values(written).reduce((a, b) => a + b, 0);
    if (!n && !remaining) return { summary: "Catalogue is fully translated.", skipLog: true };
    const langs = Object.entries(written).map(([l, c]) => `${LANGUAGES[l] ?? l} ${c}`).join(", ");
    return {
      summary: n ? `Translated ${n} catalogue text(s): ${langs}.${remaining ? ` ${remaining} more queued for the next run.` : ""}`
        : `No translation provider answered; ${remaining} text(s) queued for the next run.`,
      provider: [...providers].join(", ") || "rules-engine",
      actions: Object.entries(written).map(([l, c]) => ({ type: "translate", label: `${LANGUAGES[l] ?? l}: ${c} text(s)` })),
      output: { written, remaining },
    };
  },
};

/** Stored catalogue translations for one or more salons → lookup function (falls back to the original text). */
export async function loadTranslations(db: SupabaseClient, tenantIds: string[], lang: string): Promise<(text: string | null | undefined) => string> {
  const same = (t: string | null | undefined) => t ?? "";
  if (!tenantIds.length || !(TRANSLATE_LANGS as readonly string[]).includes(lang)) return same;
  const { data } = await db.from("translations").select("source_hash, text").in("tenant_id", tenantIds).eq("lang", lang).eq("is_public", true).limit(5000);
  if (!data?.length) return same;
  const map = new Map(data.map((r) => [r.source_hash, r.text]));
  return (t) => (t ? map.get(sourceHash(t)) ?? t : "");
}
