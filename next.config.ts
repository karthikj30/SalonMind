import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server bundle for the Docker / Kubernetes image (Vercel ignores this)
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // Send <title>, icons and other metadata in <head> for every visitor instead of streaming them into <body>.
  // Streamed metadata comes with an inline script that moves the icon <link> into <head> before React
  // hydrates; on a slow network that move made hydration fail (React error 418) on the Hindi landing and log-in
  // pages, and React's rebuild then dropped the dark/light theme class.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
