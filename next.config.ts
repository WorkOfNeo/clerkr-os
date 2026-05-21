import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"` — it conflicts with `next start` on Railway's
  // default runtime. We don't ship our own Docker image, so we don't need it.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
