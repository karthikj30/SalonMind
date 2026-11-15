import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SalonMind — AI-native salon ERP & marketplace", template: "%s · SalonMind" },
  description: "Multi-agent AI platform that runs salon operations across India: scheduling, CRM, inventory, HR, GST billing and a consumer marketplace.",
  applicationName: "SalonMind",
  appleWebApp: { capable: true, title: "SalonMind", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3b1e38" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
