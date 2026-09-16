import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@streamline/engine", "@streamline/contracts", "@streamline/ui", "@streamline/api", "@streamline/db", "@streamline/fixture"],
  typescript: { ignoreBuildErrors: false },
  // Left for Node to resolve at runtime rather than bundled: Fastify and
  // better-auth do not survive bundling cleanly, pg must keep its native
  // paths, and PGlite carries a WebAssembly build that has no business in a
  // serverless artifact (it is only reached when DATABASE_URL is unset).
  serverExternalPackages: ["fastify", "better-auth", "@better-auth/drizzle-adapter", "pg", "@electric-sql/pglite"],
};

export default nextConfig;
