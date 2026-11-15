import type { MetadataRoute } from "next";

/** Installable on staff phones (Add to Home screen) — light, works on 4G. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SalonMind", short_name: "SalonMind", description: "AI-native salon management & marketplace",
    start_url: "/app", display: "standalone", background_color: "#fbf8f4", theme_color: "#3b1e38",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
