import { defineConfig, devices } from "@playwright/test";

const port = 3000;
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "pnpm --filter @streamline/web dev",
    url: `http://127.0.0.1:${port}/api/v1/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
