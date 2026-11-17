"use client";
import { useEffect } from "react";
import { UI_SOURCE } from "@/lib/i18n/app/source";

const ALLOW = new Set(UI_SOURCE);
const NO_TEXT = "script,style,code,pre,kbd,textarea,[translate='no'],[data-no-i18n]";
const NO_ATTR = "[translate='no'],[data-no-i18n]";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Shows the owner dashboard in the chosen Indian language without touching any page's source:
 * every text node / placeholder / title / aria-label inside [data-i18n-root] whose English text is a known
 * UI string is swapped for its translation (hand-made dictionary first, then the free translation route).
 * Only exact UI strings are ever translated, so client names, notes, messages and numbers are left alone.
 * New content (navigation, server-action results) is translated by a MutationObserver before it is painted.
 */
export function UiTranslator({ lang, dict }: { lang: string; dict: Record<string, string> }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-i18n-root]");
    if (!root) return;
    const reveal = () => root.removeAttribute("data-i18n-wait");
    if (lang === "en") return reveal();

    const storeKey = `sm_ui_${lang}`;
    let cache: Record<string, string> = {};
    try { cache = JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch { /* storage blocked */ }
    const lookup = (k: string) => dict[k] ?? cache[k];
    const setText = new WeakMap<Node, string>();
    const setAttr = new WeakMap<Element, Record<string, string>>();
    const asked = new Set<string>();
    const want = new Set<string>();

    const text = (n: Node) => {
      const v = n.nodeValue ?? "";
      if (!v.trim() || setText.get(n) === v) return;
      const k = norm(v);
      const t = lookup(k);
      if (t) {
        const out = v.replace(/^(\s*)[\s\S]*?(\s*)$/, (_m, a: string, b: string) => a + t + b);
        n.nodeValue = out;
        setText.set(n, out);
      } else if (ALLOW.has(k) && !asked.has(k)) want.add(k);
    };
    const attrs = (el: Element) => {
      if (el.closest(NO_ATTR)) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const rec = setAttr.get(el) ?? {};
        if (rec[a] === v) continue;
        const k = norm(v);
        const t = lookup(k);
        if (t) { el.setAttribute(a, t); rec[a] = t; setAttr.set(el, rec); }
        else if (ALLOW.has(k) && !asked.has(k)) want.add(k);
      }
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) { if (!node.parentElement?.closest(NO_TEXT)) text(node); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      attrs(el);
      el.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach(attrs);
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) if (!t.parentElement?.closest(NO_TEXT)) text(t);
    };

    let timer = 0;
    const fetchMissing = async () => {
      const batch = [...want].slice(0, 60);
      batch.forEach((s) => { want.delete(s); asked.add(s); });
      try {
        const r = await fetch("/api/i18n/ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, strings: batch }) });
        const d = (await r.json().catch(() => ({}))) as { t?: Record<string, string> };
        if (d.t && Object.keys(d.t).length) {
          Object.assign(cache, d.t);
          try { localStorage.setItem(storeKey, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
          walk(root);
        }
      } catch { /* offline: stay in English for these strings */ }
      if (want.size) schedule();
    };
    const schedule = () => { if (!want.size) return; window.clearTimeout(timer); timer = window.setTimeout(fetchMissing, 350); };

    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") { if (!r.target.parentElement?.closest(NO_TEXT)) text(r.target); }
        else if (r.type === "attributes") attrs(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
      obs.takeRecords(); // our own edits — already translated
      schedule();
    });
    walk(root);
    reveal();
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    schedule();
    return () => { obs.disconnect(); window.clearTimeout(timer); };
  }, [lang, dict]);
  return null;
}
