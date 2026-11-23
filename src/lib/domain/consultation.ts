/**
 * Client consultation card: colour formulas and allergy-alert (patch / skin) tests.
 * Industry practice (colour manufacturers, UK/EU salon insurers): test at least 48 hours before every colour
 * service, and re-test every 12 months or whenever the product brand changes.
 */
export const PATCH_TEST_LEAD_HOURS = 48;
export const PATCH_TEST_VALID_DAYS = 365;

const COLOUR = /colou?r|tint|bleach|highlight|balayage|ombre|ombré|lightener|toner|henna|dye|lash lift|brow (tint|lamination)|keratin|global/i;

/** Services that need a valid patch test (by category or name). */
export function needsPatchTest(service: { name?: string | null; category?: string | null }) {
  return COLOUR.test(`${service.category ?? ""} ${service.name ?? ""}`);
}

export type PatchTest = { tested_on: string; result: "pending" | "pass" | "fail" };

const dayMs = 86_400_000;

/**
 * Is the client cleared for a colour service starting at `start`?
 *  - "ok": a passed test, at least 48 h before the appointment and less than 12 months old
 *  - "too_soon": passed/pending test, but not yet 48 h before the appointment (or result pending)
 *  - "failed": the latest test reacted — do not colour
 *  - "expired" / "missing": a new test is needed
 */
export function patchTestStatus(tests: PatchTest[], start: Date): { status: "ok" | "too_soon" | "failed" | "expired" | "missing"; latest: PatchTest | null } {
  const sorted = [...tests].sort((a, b) => b.tested_on.localeCompare(a.tested_on));
  const latest = sorted[0] ?? null;
  if (!latest) return { status: "missing", latest };
  if (latest.result === "fail") return { status: "failed", latest };
  const tested = Date.parse(`${latest.tested_on}T00:00:00+05:30`);
  const ageDays = (start.getTime() - tested) / dayMs;
  if (ageDays > PATCH_TEST_VALID_DAYS) return { status: "expired", latest };
  if (latest.result === "pending" || start.getTime() - tested < PATCH_TEST_LEAD_HOURS * 3_600_000) return { status: "too_soon", latest };
  return { status: "ok", latest };
}

/** Latest date a test can be done and still clear the appointment (YYYY-MM-DD, IST). */
export function latestTestDate(start: Date) {
  return new Date(start.getTime() - PATCH_TEST_LEAD_HOURS * 3_600_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
