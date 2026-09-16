import { defineConfig, devices } from "@playwright/test";

/**
 * The demo script in docs/DEMO_PLAN.md, executable. Runs against a production
 * build of the web app and a freshly re-seeded API on its own PGlite directory,
 * so every run starts from the fixture's "today" (15 Sep 2026).
 */
const webPort = 3000;
const apiPort = 3001;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // iPhone 13 geometry and touch on Chromium: only Chromium is preinstalled in this environment.
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: [
    {
      command: "pnpm --filter @streamline/api e2e",
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @streamline/web start",
      url: `http://127.0.0.1:${webPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_URL: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
