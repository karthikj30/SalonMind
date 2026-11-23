import type { MetadataRoute } from "next";

/** Installable on staff phones and desktops (Add to Home screen / Install app) — light, works on 4G. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app", name: "SalonMind", short_name: "SalonMind", description: "AI-native salon management & marketplace",
    start_url: "/open?shell=pwa", scope: "/", display: "standalone", background_color: "#fbf8f4", theme_color: "#3b1e38",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Bookings", url: "/app/bookings" },
      { name: "Inbox", url: "/app/inbox" },
      { name: "Billing", url: "/app/billing" },
    ],
  };
}
