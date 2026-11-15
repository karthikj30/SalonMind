import type { Config } from "tailwindcss";

/**
 * SalonMind design tokens — "luxury salon": deep plum (brand), blush / rose-gold (rose),
 * champagne (gold) on warm ivory. Colours are CSS variables (see globals.css) so light and dark
 * themes swap palettes without touching component classes.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (n: string, steps: number[]) => Object.fromEntries(steps.map((s) => [s, v(`${n}-${s}`)]));

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: scale("brand", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        rose: scale("rose", [50, 100, 200, 300, 400, 500, 600, 700]),
        gold: scale("gold", [50, 100, 200, 300, 400, 500, 600, 700]),
        ivory: scale("ivory", [50, 100, 200, 300]),
        surface: v("surface"),
        // fixed (non-themed) tints for text on the always-dark plum gradients
        onplum: { DEFAULT: "#f3e8f1", muted: "#e7d1e3", faint: "#d2aacb" },
        champ: { 200: "#f0dcae", 300: "#e8cf8f", 400: "#dcb860" },
        ink: "#24111f",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      borderColor: { DEFAULT: "rgb(var(--border) / 1)" },
      boxShadow: {
        soft: "0 1px 2px rgb(var(--shadow) / .05), 0 4px 16px -4px rgb(var(--shadow) / .10)",
        lift: "0 2px 4px rgb(var(--shadow) / .08), 0 12px 32px -8px rgb(var(--shadow) / .22)",
        glow: "0 0 0 1px rgb(var(--gold-400) / .35), 0 8px 30px -6px rgb(var(--gold-400) / .35)",
      },
      backgroundImage: {
        "plum-gradient": "linear-gradient(135deg, #3b1e38 0%, #66325f 55%, #94402e 100%)",
        "rose-gold": "linear-gradient(135deg, #7e3f75 0%, #b9523a 100%)",
        champagne: "linear-gradient(135deg, rgb(var(--gold-100)) 0%, rgb(var(--rose-100)) 100%)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(.96)" }, to: { opacity: "1", transform: "none" } },
        "slide-in-left": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        "slide-in-right": { from: { opacity: "0", transform: "translateX(12px)" }, to: { opacity: "1", transform: "none" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        twinkle: { "0%,100%": { opacity: ".35", transform: "scale(.85)" }, "50%": { opacity: "1", transform: "scale(1.15)" } },
        "gradient-x": { "0%,100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
        "pulse-ring": { "0%": { boxShadow: "0 0 0 0 rgb(var(--rose-500) / .55)" }, "100%": { boxShadow: "0 0 0 10px rgb(var(--rose-500) / 0)" } },
        "draw": { from: { strokeDashoffset: "24" }, to: { strokeDashoffset: "0" } },
        "snip": { "0%,100%": { transform: "rotate(0deg)" }, "50%": { transform: "rotate(-14deg)" } },
      },
      animation: {
        "fade-in": "fade-in .3s ease-out both",
        "fade-up": "fade-up .55s cubic-bezier(.2,.7,.2,1) both",
        "scale-in": "scale-in .22s ease-out both",
        "slide-in-left": "slide-in-left .28s cubic-bezier(.2,.7,.2,1) both",
        "slide-in-right": "slide-in-right .3s ease-out both",
        float: "float 6s ease-in-out infinite",
        twinkle: "twinkle 2.6s ease-in-out infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
        snip: "snip 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
