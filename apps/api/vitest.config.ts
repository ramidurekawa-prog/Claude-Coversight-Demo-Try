import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    env: { NODE_ENV: "test" },
  },
});
