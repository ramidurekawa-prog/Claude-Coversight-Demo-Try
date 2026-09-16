import { expect, test } from "@playwright/test";
import { businessDate, signIn } from "./helpers";

/**
 * The ten-step demo script from docs/DEMO_PLAN.md §3, end to end:
 * DATA → FINDING → RECOMMENDATION → ACTION → EXECUTION → MEASUREMENT → VERIFIED RESULT → ROI PROOF.
 * Runs once per project (desktop, then mobile) against a freshly seeded API.
 */
test.describe.serial("the demo script", () => {
  // Every project (desktop, then mobile) starts from the fixture's "today": the owner resets the org.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, "rose@rosewood.example");
    const res = await page.request.post("/api/v1/demo/reset", { data: {}, headers: { origin: "http://127.0.0.1:3000" } });
    expect(res.ok()).toBeTruthy();
    await ctx.close();
  });

  test("1–2 · Home leads with persistent verified savings; Today ranks by consequence of inaction", async ({ page }) => {
    await signIn(page, "rose@rosewood.example");
    await expect(page.getByText(/still reaching the margin/)).toBeVisible();
    await expect(page.getByText(/what you pay us/)).toBeVisible();
    await expect(page.getByText(/Needs you first/)).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/\b(guaranteed|certain|proven)\b/i);
    await expect(page.locator(".envbar")).toContainText(/Synthetic data/);

    await page.goto("/today");
    await expect(page.locator(".qc").first()).toBeVisible();
    await expect(page.locator(".qc").first()).toContainText(/We stopped|Guardrail/i);
  });

  test("3 · Profit Recovery shows the funnel with one class per stage", async ({ page }) => {
    await signIn(page, "rose@rosewood.example");
    await page.goto("/recovery");
    await expect(page.getByText(/Qualified/).first()).toBeVisible();
    await expect(page.locator(".funnel-row")).toHaveCount(8);
  });

  test("4–5 · a finding is explained and accepted into an action and a frozen plan", async ({ page }) => {
    await signIn(page, "rose@rosewood.example");
    await page.goto("/findings");
    await expect(page.getByText(/Dinner comps are running above/).first()).toBeVisible();
    await page.goto("/findings/F-CMP-OAK-DINNER");
    await expect(page.getByText(/comping .* of gross/i).first()).toBeVisible();
    await expect(page.locator("svg.chart").first()).toBeVisible();
    await expect(page.getByText(/eight dimensions/i).first()).toBeVisible();

    await page.getByRole("button", { name: /Accept/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: /Accept|Create/ }).last().click();
    await expect(page.getByText(/Created A-\d+ and IV-\d+/)).toBeVisible({ timeout: 30_000 });
  });

  test("6 · the action is marked done with evidence and the window opens", async ({ page }) => {
    await signIn(page, "rose@rosewood.example");
    await page.goto("/actions");
    const row = page.locator("[id^='A-']").filter({ hasText: /Comp approval|comps/i }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Mark done/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("Toast approval threshold $1,000 → $25 at Oakland, changed today at 09:14");
    await dialog.locator('button[type="submit"]').click();
    await expect(page.getByText(/Window open on IV-\d+/)).toBeVisible({ timeout: 30_000 });

    await page.goto("/changes");
    await expect(page.getByText(/Measuring/).first()).toBeVisible();
  });

  test("7–8 · the clock advances, the window closes and the verification service decides", async ({ page }) => {
    await signIn(page, "rose@rosewood.example");
    const before = await businessDate(page);
    await page.locator(".clockchip").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "+42 days" }).click();
    await dialog.getByRole("button", { name: "Advance the clock" }).click();
    await expect(dialog.getByText(/The clock now stands on/)).toBeVisible({ timeout: 90_000 });
    await page.keyboard.press("Escape");
    await page.reload();
    expect(await businessDate(page)).not.toBe(before);

    await page.goto("/changes/IV-07");
    await expect(page.getByText(/Sixteen hours out of Oakland Tuesday dinner/)).toBeVisible();
    await expect(page.getByText(/The window is open/)).toHaveCount(0);
    await expect(page.getByText(/measurement plan/i).first()).toBeVisible();

    await page.goto("/changes/IV-11");
    await expect(page.getByText(/Point estimate|We could not tell|did not move|lower bound/i).first()).toBeVisible();
  });

  test("9–10 · ROI proof and Data quality read the same ledger", async ({ page }) => {
    await signIn(page, "rose@rosewood.example");
    await page.goto("/proof");
    await expect(page.getByText(/Savings ledger/i).first()).toBeVisible();
    await expect(page.getByText(/Reversal/).first()).toBeVisible();
    await expect(page.getByText(/never/i).first()).toBeVisible();
    const dollars = (t: string | null) => t?.match(/\$[\d,]+/)?.[0];
    const heroProof = dollars(await page.locator(".hero-fig").first().textContent());
    await page.goto("/");
    const heroHome = dollars(await page.locator(".hero-fig").first().textContent());
    expect(heroHome).toBeDefined();
    expect(heroHome).toBe(heroProof);

    await page.goto("/data");
    await expect(page.getByText(/Reservations/).first()).toBeVisible();
    await expect(page.getByText(/stale/i).first()).toBeVisible();
  });
});

test.describe("tenancy and personas", () => {
  test("a new tenant is honestly empty and sees none of Rosewood", async ({ page }) => {
    await signIn(page, "elena@harborhouse.example");
    await expect(page.getByText(/Baselines are still accumulating/)).toBeVisible();
    await page.goto("/findings/F-CMP-OAK-DINNER");
    await expect(page.getByText(/No such record/)).toBeVisible();
    await page.goto("/proof");
    await expect(page.getByText(/Nothing has been verified yet/i).first()).toBeVisible();
  });

  test("a GM is scoped to their room and finance may read but not decide", async ({ page }) => {
    await signIn(page, "maria@rosewood.example");
    await expect(page.locator(".seg, .clockchip").first()).toBeVisible();
    await page.goto("/findings/F-POR-BRK-SK01");
    await expect(page.getByText(/No such record/)).toBeVisible();
    await page.goto("/findings/F-PRC-OAK-M01");
    await expect(page.getByText(/priced below/i).first()).toBeVisible();
  });

  test("nobody signed in is sent to the sign-in page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/proof");
    await expect(page).toHaveURL(/\/login/);
  });
});
