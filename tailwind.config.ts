import type { Config } from "tailwindcss";

/**
 * SalonMind design tokens — "luxury salon": deep plum (brand), blush / rose-gold (rose),
 * champagne (gold) on warm ivory. `brand` is plum so existing brand-* classes inherit the theme.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#faf5f9", 100: "#f3e8f1", 200: "#e7d1e3", 300: "#d2aacb", 400: "#b77aab", 500: "#9a5590", 600: "#7e3f75", 700: "#66325f", 800: "#4f284a", 900: "#3b1e38", 950: "#24111f" },
        rose: { 50: "#fdf6f4", 100: "#fbe9e4", 200: "#f6d0c6", 300: "#eeaf9d", 400: "#e3866d", 500: "#d4694f", 600: "#b9523a", 700: "#94402e" },
        gold: { 50: "#fcf8ee", 100: "#f8efd9", 200: "#f0dcae", 300: "#e8cf8f", 400: "#dcb860", 500: "#c9a043", 600: "#a8812e", 700: "#7f6123" },
        ivory: { 50: "#fffdfa", 100: "#fbf8f4", 200: "#f5efe7", 300: "#ebe2d6" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      borderColor: { DEFAULT: "#ead9e6" },
      boxShadow: {
        soft: "0 1px 2px rgba(59,30,56,.04), 0 4px 16px -4px rgba(59,30,56,.08)",
        lift: "0 2px 4px rgba(59,30,56,.06), 0 12px 32px -8px rgba(59,30,56,.18)",
      },
      backgroundImage: {
        "plum-gradient": "linear-gradient(135deg, #3b1e38 0%, #66325f 55%, #94402e 100%)",
        "rose-gold": "linear-gradient(135deg, #7e3f75 0%, #b9523a 100%)",
        "champagne": "linear-gradient(135deg, #f8efd9 0%, #fbe9e4 100%)",
      },
      keyframes: { shimmer: { "100%": { transform: "translateX(100%)" } }, "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { "fade-in": "fade-in .25s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
