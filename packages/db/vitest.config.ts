import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "db",
    include: ["test/**/*.test.ts"],
    // Every test boots a WASM Postgres (PGlite); run files serially so they do not
    // oversubscribe the CPU, and give the seed-heavy tests headroom.
    fileParallelism: false,
    testTimeout: 180_000,
  },
});
