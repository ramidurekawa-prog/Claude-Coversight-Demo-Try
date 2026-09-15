import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/engine",
      "packages/fixture",
      "packages/contracts",
      "packages/db",
      "apps/web",
    ],
    passWithNoTests: true,
  },
});
