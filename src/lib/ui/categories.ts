import { Brush, Crown, Flower2, Gem, Palette, Scissors, Sparkles, Waves, type LucideIcon } from "lucide-react";

/** One consistent colour + icon per service category across calendar, menus, marketplace. */
export const CATEGORIES: Record<string, { label: string; icon: LucideIcon; chip: string; block: string; dot: string }> = {
  hair: { label: "Hair", icon: Scissors, chip: "bg-brand-100 text-brand-800", block: "bg-brand-100 border-brand-400 text-brand-900", dot: "bg-brand-500" },
  colour: { label: "Colour", icon: Palette, chip: "bg-rose-100 text-rose-700", block: "bg-rose-100 border-rose-400 text-rose-700", dot: "bg-rose-500" },
  skin: { label: "Skin", icon: Flower2, chip: "bg-emerald-100 text-emerald-800", block: "bg-emerald-50 border-emerald-400 text-emerald-900", dot: "bg-emerald-500" },
  nails: { label: "Nails", icon: Gem, chip: "bg-pink-100 text-pink-800", block: "bg-pink-50 border-pink-400 text-pink-900", dot: "bg-pink-500" },
  makeup: { label: "Makeup", icon: Brush, chip: "bg-amber-100 text-amber-800", block: "bg-amber-50 border-amber-400 text-amber-900", dot: "bg-amber-500" },
  spa: { label: "Spa", icon: Waves, chip: "bg-sky-100 text-sky-800", block: "bg-sky-50 border-sky-400 text-sky-900", dot: "bg-sky-500" },
  grooming: { label: "Grooming", icon: Scissors, chip: "bg-slate-200 text-slate-800", block: "bg-slate-100 border-slate-400 text-slate-900", dot: "bg-slate-500" },
  bridal: { label: "Bridal", icon: Crown, chip: "bg-gold-100 text-gold-700", block: "bg-gold-50 border-gold-400 text-gold-700", dot: "bg-gold-500" },
};
export const category = (c?: string | null) => CATEGORIES[(c ?? "").toLowerCase()] ?? { label: c ?? "Service", icon: Sparkles, chip: "bg-brand-100 text-brand-800", block: "bg-brand-50 border-brand-300 text-brand-900", dot: "bg-brand-400" };

/** Deterministic monogram + gradient for salons without a logo. */
const GRADS = ["from-brand-700 to-rose-600", "from-brand-900 to-brand-500", "from-rose-600 to-gold-500", "from-brand-800 to-rose-500", "from-gold-600 to-rose-500"];
export function monogram(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  const initials = (words[0]?.[0] ?? "S") + (words[1]?.[0] ?? "");
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { initials: initials.toUpperCase(), gradient: GRADS[h % GRADS.length] };
}
