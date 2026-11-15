/** Retention-cycle + churn scoring (explainable). */
export function visitCycle(visitDates: Date[], fallbackDays = 30) {
  const d = [...visitDates].sort((a, b) => a.getTime() - b.getTime());
  if (d.length < 2) return { avg: fallbackDays, lastGap: null as number | null, visits: d.length };
  const gaps = d.slice(1).map((x, i) => (x.getTime() - d[i].getTime()) / 86_400_000);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return { avg: Math.max(3, avg), lastGap: gaps[gaps.length - 1], visits: d.length };
}

export function churnRisk(f: { daysSinceLast: number | null; avgCycle: number; lastGap: number | null; sentiment: number | null; noShows: number; visits: number }) {
  const factors: string[] = [];
  if (f.daysSinceLast === null) return { risk: 0, factors: ["no completed visits yet"] };
  let z = -2.2;
  const overdue = f.daysSinceLast / f.avgCycle;
  if (overdue > 1) { z += Math.min(3, (overdue - 1) * 2.2); factors.push(`overdue ×${overdue.toFixed(1)} of usual ${Math.round(f.avgCycle)}-day cycle`); }
  if (f.lastGap && f.lastGap > f.avgCycle * 1.4) { z += 0.6; factors.push("visit frequency dropping"); }
  if (f.sentiment !== null && f.sentiment < 0) { z += 1.5 * -f.sentiment + 0.5; factors.push("negative review sentiment"); }
  if (f.noShows > 0) { z += 0.4 * f.noShows; factors.push(`${f.noShows} no-show(s)`); }
  if (f.visits >= 5) { z -= 0.5; factors.push("loyal (5+ visits)"); }
  return { risk: Math.round((1 / (1 + Math.exp(-z))) * 100) / 100, factors };
}

const POS = ["good", "great", "excellent", "amazing", "love", "loved", "best", "happy", "nice", "perfect", "friendly", "awesome", "accha", "achha", "badhiya", "mast", "sundar", "shandar", "superb", "clean", "professional"];
const NEG = ["bad", "worst", "rude", "late", "dirty", "poor", "terrible", "awful", "never", "disappointed", "overpriced", "expensive", "burnt", "damage", "damaged", "bekar", "bekaar", "ganda", "bura", "kharab", "waited", "unhygienic", "pain", "rash", "allergy"];

/** Lexicon sentiment (EN + Hinglish) in [-1, 1] — fallback when no LLM is configured. */
export function lexiconSentiment(text: string): number {
  const words = text.toLowerCase().split(/[^a-zऀ-ॿ]+/);
  let s = 0;
  words.forEach((w, i) => {
    const neg = i > 0 && ["not", "no", "nahi", "nahin"].includes(words[i - 1]);
    if (POS.includes(w)) s += neg ? -1 : 1;
    if (NEG.includes(w)) s += neg ? 0.5 : -1;
  });
  return Math.max(-1, Math.min(1, s / 3));
}
