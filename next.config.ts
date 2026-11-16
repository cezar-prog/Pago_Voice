import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev only: lets the phone reach the dev server through a Cloudflare tunnel
  // (the tunnel hostname changes each run). Without this, Next blocks the
  // HMR socket and the page never hydrates, so buttons do nothing.
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
