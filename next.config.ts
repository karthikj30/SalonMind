import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server bundle for the Docker / Kubernetes image (Vercel ignores this)
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
