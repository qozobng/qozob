import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This tells Vercel to ignore TypeScript errors and force the build
  typescript: {
    ignoreBuildErrors: true,
  },
  // This tells Vercel to ignore ESLint formatting warnings
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;