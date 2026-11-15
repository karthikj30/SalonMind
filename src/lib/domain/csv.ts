/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "client name", "customer name", "client", "customer"],
  first: ["first name", "firstname", "given name"],
  last: ["last name", "lastname", "surname", "family name"],
  phone: ["phone", "mobile", "mobile number", "phone number", "contact", "contact number", "cell", "whatsapp"],
  email: ["email", "email address", "e-mail"],
  birthday: ["birthday", "date of birth", "dob", "birth date"],
  notes: ["notes", "note", "client notes", "comments"],
};

export type ImportedClient = { name: string; phone: string | null; email: string | null; birthday: string | null; notes: string | null };

function normPhone(p: string) {
  const d = p.replace(/[^\d+]/g, "");
  if (!d) return null;
  if (/^\d{10}$/.test(d)) return "+91" + d;
  if (/^0\d{10}$/.test(d)) return "+91" + d.slice(1);
  if (/^91\d{10}$/.test(d)) return "+" + d;
  return d.startsWith("+") ? d : "+" + d;
}

function normDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // Indian DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Map exports from Fresha / Vagaro / Booksy / Square / Excel sheets onto SalonMind clients. */
export function mapClientRows(rows: string[][]): { clients: ImportedClient[]; skipped: number; columns: Record<string, number> } {
  if (rows.length < 2) return { clients: [], skipped: 0, columns: {} };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    const i = head.findIndex((h) => names.includes(h));
    if (i >= 0) col[k] = i;
  }
  const get = (r: string[], k: string) => (col[k] !== undefined ? (r[col[k]] ?? "").trim() : "");
  const out: ImportedClient[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const name = get(r, "name") || [get(r, "first"), get(r, "last")].filter(Boolean).join(" ");
    const phone = normPhone(get(r, "phone"));
    if (!name || (phone && seen.has(phone))) { skipped++; continue; }
    if (phone) seen.add(phone);
    out.push({ name, phone, email: get(r, "email") || null, birthday: normDate(get(r, "birthday")), notes: get(r, "notes") || null });
  }
  return { clients: out, skipped, columns: col };
}
