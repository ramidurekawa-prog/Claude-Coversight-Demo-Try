// Flat config. Engine purity rules live in packages/engine/eslint.config.mjs and are
// also enforced by packages/engine/test/purity-guard.test.ts.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/web/next-env.d.ts",
      "packages/db/drizzle/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    // The engine is pure: no clock, no randomness, no I/O. Enforced here and by test.
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "Date", "fetch", "setTimeout", "setInterval", "process", "window", "document"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Engine is deterministic: no Math.random." },
        { object: "Date", property: "now", message: "Engine takes asOf as an argument: no Date.now." },
        { object: "crypto", property: "randomUUID", message: "Engine is deterministic." },
      ],
      "no-restricted-imports": ["error", { patterns: ["node:*", "fs", "path", "http", "https", "crypto", "@streamline/db", "@streamline/fixture", "next", "react"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "e2e/**/*.ts", "**/scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
