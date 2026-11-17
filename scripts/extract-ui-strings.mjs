#!/usr/bin/env node
/**
 * Collects every English UI string of the owner dashboard (JSX text, user-facing attributes, nav labels,
 * widget titles, flash messages) into src/lib/i18n/app/source.ts.
 *
 * That list is the ALLOWLIST for runtime translation: only text that is part of our own source code may be sent
 * to a translation provider — never client names, notes, messages or anything else typed by users.
 * Run `npm run i18n:extract` after changing UI copy (a unit test fails when the list is stale).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export const SOURCES = [
  "src/app/app", "src/app/login/page.tsx", "src/app/signup/page.tsx", "src/app/onboarding/page.tsx", "src/app/auth-actions.ts",
  "src/components/ui.tsx", "src/components/AuthShell.tsx", "src/components/DayCalendar.tsx", "src/components/Widgets.tsx",
  "src/components/VoiceAssistant.tsx", "src/components/CommandPalette.tsx", "src/components/ThemeToggle.tsx",
  "src/components/SubmitButton.tsx", "src/lib/services/metrics.ts", "src/lib/domain/voice.ts",
];
const ATTRS = new Set(["title", "label", "placeholder", "subtitle", "eyebrow", "hint", "pendingText", "aria-label", "empty", "alt"]);
const PROPS = new Set(["label", "title", "hint"]);
/** Enum values that are rendered as-is (badges, statuses, channels). */
const EXTRA = ["Good morning", "Good afternoon", "Good evening", "Language"];
const ENUMS = ["booked", "confirmed", "completed", "no_show", "cancelled", "simulated", "sent", "failed", "queued", "waiting", "offered",
  "draft", "negotiating", "approved", "received", "open", "closed", "ok", "error", "pending", "processing", "done", "paid", "unpaid",
  "screening", "shortlisted", "rejected", "hired", "interview", "active", "expired", "used", "human", "ai", "stylist", "manager", "receptionist",
  "employee", "booth_renter", "commission", "hair", "skin", "nails", "makeup", "spa", "grooming", "colour", "bridal", "other"];

export function extract() {
  const out = new Set([...ENUMS, ...EXTRA]);
  const ENT = { apos: "'", quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rarr: "→", larr: "←", middot: "·", times: "×", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
  const add = (raw) => {
    const s = raw.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m)).replace(/\s+/g, " ").trim();
    if (!/\p{L}{2}/u.test(s) || s.length > 400) return;
    if (/^(bg|text|border|rounded|flex|grid|h|w|p|m)-[\w/.[\]-]+( |$)/.test(s)) return; // class names
    out.add(s);
  };
  const scan = (file) => {
    const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const strOf = (e) => (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null);
    const visit = (n) => {
      if (ts.isJsxText(n)) add(n.text);
      if (ts.isJsxAttribute(n) && n.initializer) {
        const name = n.name.getText();
        const e = ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer;
        if (ATTRS.has(name)) {
          if (strOf(e)) add(strOf(e));
          if (e && ts.isConditionalExpression(e)) [e.whenTrue, e.whenFalse].forEach((b) => strOf(b) && add(strOf(b)));
        }
        if (name === "head" && e && ts.isArrayLiteralExpression(e)) e.elements.forEach((el) => strOf(el) && add(strOf(el)));
      }
      if (ts.isJsxExpression(n) && n.expression) {
        const e = n.expression;
        if (strOf(e)) add(strOf(e));
        if (ts.isConditionalExpression(e)) [e.whenTrue, e.whenFalse].forEach((b) => strOf(b) && add(strOf(b)));
        if (ts.isBinaryExpression(e)) [e.left, e.right].forEach((b) => strOf(b) && add(strOf(b)));
      }
      // nav arrays: ["/app/x", "Label", Icon]
      if (ts.isArrayLiteralExpression(n) && n.elements.length >= 2 && strOf(n.elements[0])?.startsWith("/") && strOf(n.elements[1])) add(strOf(n.elements[1]));
      // [value, "Label"] tuples for chips / filters
      if (ts.isArrayLiteralExpression(n) && n.elements.length === 2 && strOf(n.elements[0]) && strOf(n.elements[1]) && /^[a-z_]+$/.test(strOf(n.elements[0]))) add(strOf(n.elements[1]));
      if (ts.isPropertyAssignment(n) && PROPS.has(n.name.getText()) && strOf(n.initializer)) add(strOf(n.initializer));
      // flash messages: done("/path", "Saved.") / fail("/path", "…")
      if (ts.isCallExpression(n) && ["done", "fail"].includes(n.expression.getText()) && n.arguments[1] && strOf(n.arguments[1])) add(strOf(n.arguments[1]));
      ts.forEachChild(n, visit);
    };
    visit(src);
  };
  const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).forEach((f) => walk(path.join(p, f))) : /\.tsx?$/.test(p) && scan(p));
  SOURCES.forEach((s) => walk(path.join(ROOT, s)));
  return [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // code-point order: identical on every machine
}

export function render(strings) {
  return `// Generated by scripts/extract-ui-strings.mjs — do not edit by hand (npm run i18n:extract).\n` +
    `// Every English UI string of the owner dashboard: the allowlist for runtime translation.\n` +
    `export const UI_SOURCE: readonly string[] = [\n${strings.map((x) => `  ${JSON.stringify(x)},`).join("\n")}\n];\n`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const strings = extract();
  fs.writeFileSync(path.join(ROOT, "src/lib/i18n/app/source.ts"), render(strings));
  console.log(`${strings.length} UI strings → src/lib/i18n/app/source.ts`);
}
