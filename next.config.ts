import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Don't advertise the framework in response headers
  poweredByHeader: false,

  images: {
    // Serve brand logos as AVIF/WebP (falls back automatically) — much smaller than the source PNGs
    formats: ['image/avif', 'image/webp'],
    // Logos rarely change; let browsers/CDN keep optimised copies for 30 days
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;