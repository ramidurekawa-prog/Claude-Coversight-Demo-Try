import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@streamline/engine", "@streamline/fixture", "@streamline/contracts", "@streamline/db"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
