import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#fdf2f8", 100: "#fce7f3", 500: "#db2777", 600: "#be185d", 700: "#9d174d" },
      },
    },
  },
  plugins: [],
} satisfies Config;
