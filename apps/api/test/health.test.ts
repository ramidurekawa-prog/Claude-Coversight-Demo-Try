/**
 * Health as a diagnosis.
 *
 * A deployment gets stuck in a small number of ways, and the page that fails
 * cannot say which: a production Next.js build redacts the server's message on
 * its way to the error boundary, so "a server error occurred" is all the
 * operator sees. /api/v1/health is the one unauthenticated route, so it is
 * where the deployment says what is wrong with it and what to do about it.
 * These tests pin each stuck state to the sentence that names its remedy.
 */
import { HealthResponse } from "@streamline/contracts";
import { freshDb, unmigratedDb } from "@streamline/db/test-helpers";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestApp } from "../src/test-helpers";

async function health(app: Awaited<ReturnType<typeof createTestApp>>["app"]) {
  const res = await app.inject({ method: "GET", url: "/api/v1/health" });
  expect(res.statusCode).toBe(200);
  // Parsed, not just read: the diagnostic route must satisfy its own contract,
  // or the only page that could explain the failure 500s explaining it.
  return HealthResponse.parse(res.json());
}

describe("health diagnoses the deployment", () => {
  it("says nothing is wrong when a seeded database is behind it", async () => {
    const { app } = await createTestApp();
    const body = await health(app);
    expect(body.diagnosis).toBeUndefined();
    expect(body.database).toMatchObject({ reachable: true, migrated: true, orgs: 2, fixtureVersion: "1.0.0", asOf: "2026-09-15" });
    expect(body.mode).toBe("process");
  });

  it("names the missing connection string on a host that runs the app as a function", async () => {
    // No db at all, the shape a serverless boot fails in: DATABASE_URL absent,
    // and PGlite's data file cannot survive there.
    const app = buildApp({ deployment: "embedded" });
    await app.ready();
    const body = await health(app);
    expect(body.mode).toBe("embedded");
    expect(body.database).toMatchObject({ configured: false, kind: "pglite", reachable: false });
    expect(body.diagnosis).toMatch(/DATABASE_URL is not set/);
    expect(body.diagnosis).toMatch(/pnpm db:seed/);
    await app.close();
  });

  it("names an unreachable database without blaming the tables", async () => {
    const app = buildApp({
      db: await freshDb(),
      dbPing: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    await app.ready();
    const body = await health(app);
    expect(body.db).toBe("unavailable");
    expect(body.diagnosis).toMatch(/not reachable/);
    expect(body.diagnosis).not.toMatch(/no tables/);
    await app.close();
  });

  it("tells a reachable but unmigrated database to run the seed", async () => {
    const app = buildApp({ db: await unmigratedDb() });
    await app.ready();
    const body = await health(app);
    expect(body.db).toBe("ok");
    expect(body.database).toMatchObject({ reachable: true, migrated: false, orgs: 0, fixtureVersion: null, asOf: null });
    expect(body.diagnosis).toMatch(/no tables/);
    expect(body.diagnosis).toMatch(/pnpm db:seed/);
    await app.close();
  });

  it("distinguishes migrated-but-empty from unmigrated", async () => {
    const app = buildApp({ db: await freshDb() });
    await app.ready();
    const body = await health(app);
    expect(body.database).toMatchObject({ migrated: true, orgs: 0 });
    expect(body.diagnosis).toMatch(/hold no data/);
    expect(body.diagnosis).toMatch(/pnpm db:seed/);
    await app.close();
  });
});
