import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@streamline/engine", "@streamline/contracts", "@streamline/ui"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
