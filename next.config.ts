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
  // The numbers board is opened by a share link, so it must not hand that link
  // on: no Referer to anything it loads, no caching, no indexing, no framing.
  async headers() {
    const board = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    return [
      { source: "/numbers", headers: board },
      { source: "/numbers/:path*", headers: board },
      { source: "/n/:path*", headers: board },
    ];
  },
};

export default nextConfig;
