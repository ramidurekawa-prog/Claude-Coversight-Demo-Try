import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "streamline-demo-2026";

/** Sign in as a seeded persona through the real login form (the API sets the session cookie via the proxy). */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(email.split("@")[0]!, "i") }).or(page.locator(`input[value="${email}"]`)).first().check();
  await page.getByLabel(/Demo password/).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByText(/Synthetic data/).first()).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.request.post("/api/v1/auth/sign-out", { data: {}, headers: { origin: "http://127.0.0.1:3000" } });
  await page.context().clearCookies();
}

/** The demo clock, as the top bar shows it. */
export async function businessDate(page: Page): Promise<string> {
  return (await page.locator(".clockchip").first().textContent()) ?? "";
}
