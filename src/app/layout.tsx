import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SalonMind — AI-native salon ERP & marketplace",
  description: "Multi-agent AI platform that runs salon operations across India: scheduling, CRM, inventory, HR, GST billing and a consumer marketplace.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#be185d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
