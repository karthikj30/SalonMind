/**
 * Voice Agent — deterministic command understanding (the rules fallback, and the validator for LLM output).
 * A spoken or typed sentence + a description of the page (forms, fields, buttons) → a list of safe UI actions.
 * Pure functions: no network, no DOM. The browser executes the actions; nothing here can submit or delete by itself.
 */
import { addDays, todayIst } from "../time.ts";

export type VoiceOption = { value: string; label: string };
export type VoiceField = { form: number; name: string; label: string; type: string; options?: VoiceOption[] };
export type VoiceForm = { index: number; title: string; danger?: boolean };
export type VoiceContext = { path: string; forms: VoiceForm[]; fields: VoiceField[]; buttons: string[] };

export type VoiceAction =
  | { type: "navigate"; path: string }
  | { type: "fill"; form: number; name: string; value: string }
  | { type: "submit"; form: number } // -1 = the form that was filled last
  | { type: "click"; label: string }
  | { type: "theme"; mode: "dark" | "light" }
  | { type: "scroll"; dir: "up" | "down" | "top" | "bottom" }
  | { type: "back" }
  | { type: "query"; topic: QueryTopic }
  | { type: "say"; text: string };

export const QUERY_TOPICS = ["bookings_today", "revenue_today", "low_stock", "at_risk", "handoffs", "summary"] as const;
export type QueryTopic = (typeof QUERY_TOPICS)[number];

/** Pages the assistant may open, with the words people use for them (English, Hinglish and Indian scripts). */
export const VOICE_ROUTES: { path: string; title: string; names: string[] }[] = [
  { path: "/app", title: "Dashboard", names: ["dashboard", "home", "main page", "overview", "डैशबोर्ड", "होम", "டாஷ்போர்டு", "డాష్‌బోర్డ్", "ড্যাশবোর্ড", "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "ڈیش بورڈ"] },
  { path: "/app/bookings", title: "Bookings", names: ["bookings", "booking", "appointments", "appointment", "calendar", "schedule", "बुकिंग", "अपॉइंटमेंट", "कैलेंडर", "முன்பதிவு", "బుకింగ్", "বুকিং", "બુકિંગ", "ಬುಕಿಂಗ್", "ബുക്കിംഗ്", "ਬੁਕਿੰਗ", "بکنگ"] },
  { path: "/app/inbox", title: "Unified Inbox", names: ["inbox", "messages", "chats", "chat", "whatsapp", "unified inbox", "इनबॉक्स", "संदेश", "चैट", "மெசேஜ்", "సందేశాలు", "মেসেজ", "ઇનબોક્સ", "ಇನ್‌ಬಾಕ್ಸ್", "ان باکس", "پیغامات"] },
  { path: "/app/clients", title: "Clients", names: ["clients", "client", "customers", "customer", "ग्राहक", "क्लाइंट", "வாடிக்கையாளர்", "కస్టమర్", "গ্রাহক", "ગ્રાહક", "ಗ್ರಾಹಕ", "ഉപഭോക്താ", "ਗਾਹਕ", "گاہک"] },
  { path: "/app/loyalty", title: "Memberships & Loyalty", names: ["loyalty", "memberships", "membership", "wallet", "rewards", "waitlist", "मेंबरशिप", "लॉयल्टी", "வாலட்"] },
  { path: "/app/marketing", title: "Campaigns & Deals", names: ["marketing", "campaigns", "campaign", "deals", "offers", "ऑफ़र", "ऑफर", "कैंपेन", "சலுகை", "ఆఫర్", "অফার"] },
  { path: "/app/services", title: "Services & Rooms", names: ["services", "service menu", "menu", "rooms", "सेवाएँ", "सेवा", "सर्विस", "சேவைகள்", "సేవలు", "পরিষেবা", "સેવા", "ಸೇವೆ"] },
  { path: "/app/staff", title: "Staff & Payroll", names: ["staff", "team", "stylists", "payroll", "salary", "स्टाफ़", "स्टाफ", "कर्मचारी", "वेतन", "ஊழியர்", "సిబ్బంది", "কর্মী", "સ્ટાફ", "ಸಿಬ್ಬಂದಿ"] },
  { path: "/app/hr", title: "Recruitment", names: ["recruitment", "hiring", "jobs", "candidates", "hr", "भर्ती", "नौकरी"] },
  { path: "/app/inventory", title: "Inventory & POs", names: ["inventory", "stock", "products", "purchase orders", "vendors", "इन्वेंटरी", "स्टॉक", "சரக்கு", "స్టాక్", "স্টক", "સ્ટોક"] },
  { path: "/app/billing", title: "Billing & GST", names: ["billing", "invoices", "invoice", "bills", "gst", "payments", "बिलिंग", "बिल", "इनवॉइस", "பில்", "బిల్", "বিল", "બિલ"] },
  { path: "/app/agents", title: "Agent Console", names: ["agents", "agent console", "ai agents", "एजेंट"] },
  { path: "/app/studio", title: "AI Studio", names: ["studio", "ai studio", "workflow designer", "स्टूडियो"] },
  { path: "/app/settings", title: "Settings", names: ["settings", "setting", "preferences", "profile", "सेटिंग", "सेटिंग्स", "அமைப்புகள்", "సెట్టింగ్‌లు", "সেটিংস", "સેટિંગ"] },
  { path: "/marketplace", title: "Marketplace", names: ["marketplace", "market place", "मार्केटप्लेस"] },
];
export const VOICE_PATHS = new Set(VOICE_ROUTES.map((r) => r.path));

const NAV_VERB = /\b(open|go to|goto|show|take me to|navigate to|navigate|switch to|visit|view|kholo|khol do|dikhao|chalo|jao)\b|खोलो|खोलें|खोलिए|दिखाओ|दिखाइए|जाओ|चलो|திற|காட்டு|తెరువు|చూపించు|খোলো|দেখাও|ખોલો|ತೆರೆ|തുറക്കൂ|ਖੋਲ੍ਹੋ|کھولو|کھولیں|دکھاؤ/i;
const SUBMIT = /^(?:please\s+)?(submit|save|save it|done|confirm|add it|create it|go ahead|send it|ok submit|jama karo|save karo|sev karo|सेव करो|सेव करें|जमा करो|जमा करें|सबमिट|सबमिट करो|சேமி|சமர்ப்பி|సేవ్ చేయి|సమర్పించు|সেভ করো|জমা দাও|સેવ કરો|ಉಳಿಸಿ|സേവ് ചെയ്യൂ|ਸੇਵ ਕਰੋ|محفوظ کریں|جمع کریں)[\s.!]*$/i;
const SUBMIT_TAIL = /(?:\s+(?:and|then|aur|और)\s+|[,.]\s*)(submit|save|save it|confirm|add it|create it|सेव करो|जमा करो|सबमिट करो)[\s.!]*$/i;
const DESTRUCTIVE = /\b(delete|remove|erase|destroy|deactivate|cancel booking|refund)\b|हटाओ|डिलीट|மீட்டமை|நீக்கு|తొలగించు|মুছে/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (s: string) => s.normalize("NFC").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
/** Word-boundary match that also works for Indian scripts (no \b there). */
const wordAt = (hay: string, needle: string) => new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${esc(needle)}(?![\\p{L}\\p{M}\\p{N}])`, "iu").exec(hay);

export function matchRoute(text: string): string | null {
  const s = fold(text);
  let best: { path: string; len: number } | null = null;
  for (const r of VOICE_ROUTES) for (const n of r.names) {
    if (wordAt(s, n) && (!best || n.length > best.len)) best = { path: r.path, len: n.length };
  }
  return best?.path ?? null;
}

// ───────────── value normalisers (also applied to LLM output) ─────────────
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function parseDate(v: string): string | null {
  const s = fold(v);
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  if (/day after tomorrow|parso|परसों/.test(s)) return addDays(todayIst(), 2);
  if (/\b(tomorrow|kal)\b|कल|उद्या|நாளை|రేపు|আগামীকাল|આવતીકાલે|ನಾಳೆ|നാളെ|ਕੱਲ੍ਹ|کل/.test(s)) return addDays(todayIst(), 1);
  if (/\b(today|aaj)\b|आज|இன்று|ఈరోజు|আজ|આજે|ಇಂದು|ഇന്ന്|ਅੱਜ|آج/.test(s)) return todayIst();
  const dm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/) ?? null;
  const md = dm ? null : s.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
  const day = dm ? Number(dm[1]) : md ? Number(md[2]) : 0;
  const mon = MONTHS.indexOf((dm ? dm[2] : md ? md[1] : "") as string);
  if (day >= 1 && day <= 31 && mon >= 0) {
    const now = todayIst();
    let year = Number((dm ? dm[3] : md?.[3]) ?? now.slice(0, 4));
    let d = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!(dm ? dm[3] : md?.[3]) && d < now) d = `${++year}${d.slice(4)}`; // "5 January" said in December means next year
    return d;
  }
  const sl = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/); // Indian order: day/month/year
  return sl ? `${sl[3]}-${sl[2].padStart(2, "0")}-${sl[1].padStart(2, "0")}` : null;
}
export function parseTime(v: string): string | null {
  const s = fold(v).replace(/\bo'?clock\b/, "").replace(/\ba\.m\.?/, "am").replace(/\bp\.m\.?/, "pm");
  const m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const eve = m[3] === "pm" || /evening|night|afternoon|shaam|शाम|दोपहर|रात|மாலை|సాయంత్రం|সন্ধ্যা|સાંજ|ಸಂಜೆ/.test(s);
  if (eve && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (!m[3] && !eve && !m[2] && h >= 1 && h <= 8) h += 12; // "at 6" in a salon means 6 pm
  return h <= 23 && Number(min) <= 59 ? `${String(h).padStart(2, "0")}:${min}` : null;
}
export const parseEmail = (v: string) => {
  const s = fold(v).replace(/\s+at the rate( of)?\s+|\s+at\s+/g, "@").replace(/\s+dot\s+/g, ".").replace(/\s+underscore\s+/g, "_").replace(/\s+(dash|hyphen)\s+/g, "-").replace(/\s+/g, "");
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(s) ? s : null;
};
export const parsePhone = (v: string) => {
  const s = v.replace(/\bplus\b/gi, "+").replace(/\bdouble\s+(\d)/gi, "$1$1").replace(/\btriple\s+(\d)/gi, "$1$1$1").replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(s) ? s : null;
};
export const parseNumber = (v: string) => {
  const s = fold(v).replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|हज़ार|हजार|lakh|लाख)?/);
  if (!m) return null;
  const mult = !m[2] ? 1 : /lakh|लाख/.test(m[2]) ? 100_000 : 1000;
  return String(Number(m[1]) * mult);
};
function pickOption(v: string, options: VoiceOption[]): string | null {
  const s = fold(v);
  if (!s) return null;
  const exact = options.find((o) => fold(o.label) === s || fold(o.value) === s);
  if (exact) return exact.value;
  const tok = (x: string) => fold(x).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const want = tok(v);
  let best: { value: string; score: number } | null = null;
  for (const o of options) {
    const have = new Set([...tok(o.label), ...tok(o.value.replace(/_/g, " "))]);
    const score = want.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && (h.startsWith(w) || w.startsWith(h)))).length / want.length;
    if (score > 0 && (!best || score > best.score)) best = { value: o.value, score };
  }
  return best && best.score >= 0.5 ? best.value : null;
}
const titleCase = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());

/** Coerce a spoken value to what the field accepts; null = not usable. Secret and file fields are never filled. */
export function coerceValue(field: VoiceField, raw: string): string | null {
  const v = raw.trim().replace(/^[:=,\-–\s]+|[\s,.;]+$/g, "");
  if (!v) return null;
  const t = field.type;
  if (BLOCKED_TYPES.has(t) || BLOCKED_NAMES.test(field.name)) return null;
  if (field.options?.length) return pickOption(v, field.options);
  if (t === "tel" || (t === "text" && /^(phone|mobile|whatsapp)$/i.test(field.name))) return parsePhone(v);
  if (t === "email") return parseEmail(v);
  if (t === "number" || t === "range") return parseNumber(v);
  if (t === "date") return parseDate(v);
  if (t === "time") return parseTime(v);
  if (t === "checkbox") return /^(no|off|false|untick|uncheck|nahi|नहीं)\b/i.test(v) ? "off" : "on";
  if (t === "month") return parseDate(v)?.slice(0, 7) ?? null;
  const text = v.slice(0, 500);
  return /name|नाम/i.test(`${field.label} ${field.name}`) && !/\p{Lu}/u.test(text) ? titleCase(text) : text.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}
const BLOCKED_TYPES = new Set(["password", "hidden", "file", "submit", "button", "image", "reset"]);
const BLOCKED_NAMES = /^(confirm|password|otp|pin|cvv|card.*)$/i;
export const fillable = (f: VoiceField) => !BLOCKED_TYPES.has(f.type) && !BLOCKED_NAMES.test(f.name);

// ───────────── field matching ─────────────
const ALIASES: Record<string, string[]> = {
  phone: ["phone", "phone number", "mobile", "mobile number", "number", "contact", "whatsapp", "whatsapp number", "फ़ोन", "फोन", "मोबाइल", "नंबर", "தொலைபேசி", "ఫోన్", "ফোন", "ફોન", "ಫೋನ್", "ഫോൺ", "ਫ਼ੋਨ", "فون", "نمبر"],
  handle: ["from", "phone", "handle", "number"],
  name: ["name", "full name", "naam", "नाम", "பெயர்", "పేరు", "নাম", "નામ", "ಹೆಸರು", "പേര്", "ਨਾਮ", "نام"],
  email: ["email", "e-mail", "mail", "email address", "ईमेल", "மின்னஞ்சல்", "ఇమెయిల్", "ইমেইল", "ઇમેઇલ"],
  city: ["city", "town", "शहर", "நகரம்", "నగరం", "শহর", "શહેર"],
  base_price: ["price", "cost", "rate", "कीमत", "दाम", "விலை", "ధర", "দাম", "કિંમત"],
  duration_min: ["duration", "minutes", "time taken", "अवधि"],
  body: ["message", "text", "संदेश", "செய்தி", "సందేశం", "বার্তা"],
  date: ["date", "day", "on", "तारीख", "दिन", "தேதி", "తేదీ", "তারিখ", "તારીખ"],
  time: ["time", "at", "समय", "बजे", "நேரம்", "సమయం", "সময়", "સમય"],
  birthday: ["birthday", "date of birth", "dob", "जन्मदिन"],
  notes: ["notes", "note", "remarks", "नोट"],
  language: ["language", "preferred language", "भाषा", "மொழி", "భాష", "ভাষা"],
  gstin: ["gstin", "gst number", "gst"],
  description: ["description", "about", "details", "विवरण"],
  address: ["address", "पता", "முகவரி", "చిరునామా", "ঠিকানা"],
  title: ["title", "role title", "heading"],
  discount_pct: ["discount", "percent off", "छूट"],
  skills: ["skills", "skill"],
};
const labelsFor = (f: VoiceField) => {
  const base = fold(f.label).replace(/\(.*?\)|[*:]/g, "").trim();
  const byName = fold(f.name.replace(/_/g, " "));
  return [...new Set([base, byName, ...(ALIASES[f.name] ?? [])].filter((x) => x.length > 1))];
};
// connecting words between a label and its value ("name is Meera", "नाम है मीरा"), and verbs trailing the value ("मीरा रखो")
const GLUE = /^(?:\s*(?:(?:is|are|to|as|equals?|of|the|will be|should be|set to|hai|ka|ki)\b|[=:,\-–]|(?:है|हैं|का|की|को|में)(?=\s|$))\s*)+/iu;
const TAIL = /(?:\s+(?:and|aur|then|please|rakho|karo|likho|daalo)|\s*,|\s+(?:और|रखो|करो|लिखो|डालो|है|कर दो|रख दो))+\s*$/iu;

type Hit = { field: VoiceField; start: number; end: number; len: number };

/** Find "label value" pairs: every field label mentioned in the sentence owns the words up to the next label. */
function findFills(text: string, ctx: VoiceContext): VoiceAction[] {
  const s = text.normalize("NFC");
  const hits: Hit[] = [];
  for (const f of ctx.fields.filter(fillable)) {
    for (const l of labelsFor(f)) {
      const m = wordAt(s, l);
      if (m) hits.push({ field: f, start: m.index, end: m.index + m[0].length, len: l.length });
    }
  }
  if (!hits.length) return [];
  // pick the form mentioned by title, else the one with most labels in this sentence
  const byForm = new Map<number, Hit[]>();
  hits.forEach((h) => byForm.set(h.field.form, [...(byForm.get(h.field.form) ?? []), h]));
  const named = ctx.forms.find((f) => f.title && fold(s).includes(fold(f.title)) && byForm.has(f.index));
  const form = named?.index ?? [...byForm.entries()].sort((a, b) => new Set(b[1].map((h) => h.field.name)).size - new Set(a[1].map((h) => h.field.name)).size || a[0] - b[0])[0][0];
  // overlapping hits: longest label wins; one hit per field (first mention)
  let chosen: Hit[] = [];
  for (const h of byForm.get(form)!.sort((a, b) => b.len - a.len || a.start - b.start)) {
    if (chosen.some((c) => c.field.name === h.field.name || (h.start < c.end && c.start < h.end))) continue;
    chosen.push(h);
  }
  // Each label owns the words up to the next label. A label whose words are not a usable value (e.g. "on" /
  // "at" that were ordinary words, not the date / time field) is dropped and the spans are recomputed.
  for (;;) {
    chosen.sort((a, b) => a.start - b.start);
    const values = chosen.map((h, i) => coerceValue(h.field, s.slice(h.end, chosen[i + 1]?.start ?? s.length).replace(GLUE, "").replace(TAIL, "")));
    const bad = values.findIndex((v) => v === null);
    if (bad === -1) return chosen.map((h, i) => ({ type: "fill", form, name: h.field.name, value: values[i]! }));
    chosen = chosen.filter((_, i) => i !== bad);
    if (!chosen.length) return [];
  }
}

const QUERY: [RegExp, QueryTopic][] = [
  [/(how many|kitni|kitne|कितनी|कितने|எத்தனை|ఎన్ని|কতগুলো).*(booking|appointment|बुकिंग|अपॉइंटमेंट|முன்பதிவு|బుకింగ్|বুকিং)|(booking|appointment)s? (today|for today)|today'?s? (booking|appointment|schedule)|आज की बुकिंग/i, "bookings_today"],
  [/revenue|sales|earning|collection|income|how much.*(made|earn)|कमाई|बिक्री|आमदनी|வருமானம்|ఆదాయం|আয়/i, "revenue_today"],
  [/low (on )?stock|running (low|out)|reorder|out of stock|स्टॉक कम|कम स्टॉक/i, "low_stock"],
  [/at[- ]risk|churn|losing|not (come|visited)|lapsed|जोखिम/i, "at_risk"],
  [/hand ?off|waiting for (me|a human)|need(s)? (me|human)|complaint/i, "handoffs"],
  [/summary|brief me|briefing|how('s| is) (the )?(day|business|salon)|status|what'?s (happening|up)|सारांश|आज का हाल/i, "summary"],
];

export const VOICE_HELP = 'Try: "open bookings", "add client name Meera phone 98765 43210", "date tomorrow time 6 pm", "save", "how many bookings today?", "dark mode".';

/** Rules engine: understand one utterance without an LLM. */
export function parseVoice(text: string, ctx: VoiceContext): VoiceAction[] {
  const raw = text.normalize("NFC").trim().replace(/[.?!।]+$/, "");
  const s = fold(raw);
  if (!s) return [];
  if (/^(help|what can (i|you) (say|do)|commands|मदद|உதவி|సహాయం|সাহায্য)$/.test(s)) return [{ type: "say", text: VOICE_HELP }];
  if (SUBMIT.test(s)) return [{ type: "submit", form: -1 }];
  if (/^(go )?back$|^पीछे( जाओ)?$|^वापस( जाओ)?$|^wapas$/.test(s)) return [{ type: "back" }];
  if (/\b(dark|night) (mode|theme)\b|डार्क मोड/.test(s)) return [{ type: "theme", mode: "dark" }];
  if (/\b(light|day) (mode|theme)\b|लाइट मोड/.test(s)) return [{ type: "theme", mode: "light" }];
  const sc = s.match(/^scroll (up|down|to (?:the )?(top|bottom))$|^(नीचे|ऊपर)( करो| जाओ)?$/);
  if (sc) return [{ type: "scroll", dir: (sc[2] ?? sc[1] ?? (sc[3] === "नीचे" ? "down" : "up")) as "up" | "down" | "top" | "bottom" }];

  const actions: VoiceAction[] = [];
  const wantsSubmit = SUBMIT_TAIL.test(raw);
  const body = wantsSubmit ? raw.replace(SUBMIT_TAIL, "") : raw;

  // explicit click / press
  const click = fold(body).match(/^(?:click|press|tap|hit|push|दबाओ|क्लिक करो)(?: on)?(?: the)? (.+?)(?: button)?$/);
  if (click) {
    const label = bestButton(click[1], ctx.buttons);
    return label ? [{ type: "click", label }] : [{ type: "say", text: `I can't find a "${click[1]}" button on this page.` }];
  }

  const fills = findFills(body, ctx);
  const route = matchRoute(body);
  const navVerb = NAV_VERB.test(fold(body));
  // navigate when a verb says so, or the whole sentence is just a page name, or nothing here can be filled
  const adds = /\b(add|new|create|register)\b|नया|नई|जोड़ो|जोड़ें/i.test(body);
  if (route && route !== ctx.path && (navVerb || adds || fold(body).split(" ").length <= 3 || (!fills.length && !QUERY.some(([re]) => re.test(s))))) {
    // fields are read from the page that opens: the browser repeats the sentence there (minus the navigation)
    return [{ type: "navigate", path: route }];
  }
  if (fills.length) actions.push(...fills);

  if (!actions.length) {
    const q = QUERY.find(([re]) => re.test(s));
    if (q) return [{ type: "query", topic: q[1] }];
    const label = bestButton(fold(body), ctx.buttons, 0.75);
    if (label) return [{ type: "click", label }];
    return [{ type: "say", text: `Sorry, I didn't catch that. ${VOICE_HELP}` }];
  }
  if (wantsSubmit && actions.some((a) => a.type === "fill")) actions.push({ type: "submit", form: -1 });
  return actions;
}

function bestButton(want: string, buttons: string[], min = 0.6): string | null {
  const w = fold(want).split(" ").filter(Boolean);
  let best: { label: string; score: number } | null = null;
  for (const b of buttons) {
    if (DESTRUCTIVE.test(b)) continue;
    const bw = fold(b).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    if (!bw.length) continue;
    const common = w.filter((x) => bw.includes(x)).length;
    const score = common / Math.max(w.length, bw.length);
    if (score > 0 && (!best || score > best.score)) best = { label: b, score };
  }
  return best && best.score >= min ? best.label : null;
}

/**
 * Validate actions (from the LLM or the rules engine) against what is really on the page.
 * Unknown pages, fields, buttons and anything destructive are dropped; values are re-coerced by field type.
 */
export function sanitizeActions(actions: unknown, ctx: VoiceContext): VoiceAction[] {
  if (!Array.isArray(actions)) return [];
  const out: VoiceAction[] = [];
  for (const a of actions.slice(0, 16) as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    switch (a.type) {
      case "navigate": if (typeof a.path === "string" && VOICE_PATHS.has(a.path)) out.push({ type: "navigate", path: a.path }); break;
      case "fill": {
        const f = ctx.fields.find((x) => x.name === a.name && (typeof a.form !== "number" || x.form === a.form)) ?? ctx.fields.find((x) => x.name === a.name);
        const v = f && fillable(f) && (typeof a.value === "string" || typeof a.value === "number") ? coerceValue(f, String(a.value)) : null;
        if (f && v !== null) out.push({ type: "fill", form: f.form, name: f.name, value: v });
        break;
      }
      case "submit": {
        const idx = typeof a.form === "number" ? a.form : -1;
        if (idx === -1 || ctx.forms.some((f) => f.index === idx && !f.danger)) out.push({ type: "submit", form: idx });
        break;
      }
      case "click": {
        const label = typeof a.label === "string" ? ctx.buttons.find((b) => fold(b) === fold(a.label as string)) : undefined;
        if (label && !DESTRUCTIVE.test(label)) out.push({ type: "click", label });
        break;
      }
      case "theme": if (a.mode === "dark" || a.mode === "light") out.push({ type: "theme", mode: a.mode }); break;
      case "scroll": if (["up", "down", "top", "bottom"].includes(a.dir as string)) out.push({ type: "scroll", dir: a.dir as "up" }); break;
      case "back": out.push({ type: "back" }); break;
      case "query": if ((QUERY_TOPICS as readonly string[]).includes(a.topic as string)) out.push({ type: "query", topic: a.topic as QueryTopic }); break;
      case "say": if (typeof a.text === "string" && a.text.trim()) out.push({ type: "say", text: a.text.trim().slice(0, 400) }); break;
    }
  }
  return out;
}
