"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Pref = "system" | "light" | "dark";
const ORDER: Pref[] = ["system", "light", "dark"];

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.classList.add("theme-switching");
  el.classList.toggle("dark", dark);
  el.classList.toggle("light", !dark);
  window.setTimeout(() => el.classList.remove("theme-switching"), 350);
}

/** System → Light → Dark. Preference persists per device; "system" follows the OS live. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    let p: Pref = "system";
    try { p = (localStorage.getItem("theme") as Pref) || "system"; } catch { /* storage blocked */ }
    setPref(p);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { let cur: Pref = "system"; try { cur = (localStorage.getItem("theme") as Pref) || "system"; } catch { /* */ } if (cur === "system") apply("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const next = () => {
    const n = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(n);
    try { localStorage.setItem("theme", n); } catch { /* */ }
    apply(n);
  };
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const label = pref === "dark" ? "Dark" : pref === "light" ? "Light" : "System";
  return (
    <button type="button" onClick={next} title={`Theme: ${label} (click to change)`} aria-label={`Theme: ${label}. Click to change.`}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition hover:bg-white/10 active:scale-95 ${className}`}>
      <Icon key={pref} className="h-3.5 w-3.5 animate-scale-in" aria-hidden />{label}
    </button>
  );
}

/** Runs before paint so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var p=localStorage.getItem('theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;c.add(d?'dark':'light');}catch(e){}})();`;
