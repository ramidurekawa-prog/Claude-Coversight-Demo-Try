import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  transpilePackages: ["@streamline/engine", "@streamline/fixture", "@streamline/contracts", "@streamline/db"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
