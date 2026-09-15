import { expect, test } from "@playwright/test";

test("health endpoint answers", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ ok: true });
});
