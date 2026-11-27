import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/components/ThemeToggle";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SalonMind — AI-native salon ERP & marketplace", template: "%s · SalonMind" },
  description: "Multi-agent AI platform that runs salon operations across India: scheduling, CRM, inventory, HR, GST billing and a consumer marketplace.",
  applicationName: "SalonMind",
  appleWebApp: { capable: true, title: "SalonMind", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#3b1e38" }, { media: "(prefers-color-scheme: dark)", color: "#160d18" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      {/* No hand-written <head>: Next.js and React put the metadata there themselves. Rendering our own
          <head> made React lose its place between <head> and <body> on some loads (hydration error 418).
          The theme script runs first thing in <body>, still before anything is painted. */}
      <body className="min-h-screen font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
