import { buildRosewood, HARBOR_ORG_ID, PERSONAS, registerFingerprint, ROSEWOOD_ORG_ID } from "@streamline/fixture";
import { describe, expect, it } from "vitest";
import { createIdentityRepositories } from "../src/identity";
import { runNightly } from "../src/nightly";
import { verifyPassword } from "../src/password";
import { loadRegister } from "../src/register";
import { createRepositories } from "../src/repositories";
import { accounts, users } from "../src/schema";
import { seedDemo } from "../src/seed";
import { freshDb } from "../src/test-helpers";

describe("seed", () => {
  it("persists the fixture build, is idempotent, and keeps tenants apart", async () => {
    const db = await freshDb();
    const first = await seedDemo(db);
    expect(first).toEqual({ rosewood: "seeded", harbor: "seeded", personas: PERSONAS.length });
    const again = await seedDemo(db);
    expect(again.rosewood).toBe("noop");
    expect(again.harbor).toBe("noop");

    const repos = createRepositories(db);
    const b = buildRosewood();
    const org = await repos.orgs.findById(ROSEWOOD_ORG_ID);
    expect(org?.asOf).toBe(b.asOf);
    expect(org?.registerThrough).toBe(b.canonical.through);

    // The register round-trips through Postgres exactly.
    const reg = await loadRegister(db, ROSEWOOD_ORG_ID);
    expect(registerFingerprint(reg)).toBe(registerFingerprint(b.register));

    const findings = await repos.findings.list(ROSEWOOD_ORG_ID);
    expect(findings.map((f) => [f.id, f.state]).sort()).toEqual(b.findings.map((f) => [f.id, f.state]).sort());
    const ivs = await repos.interventions.evals(ROSEWOOD_ORG_ID);
    expect(ivs.map((iv) => [iv.id, iv.state, iv.result.outcome])).toEqual(b.interventions.map((iv) => [iv.id, iv.state, iv.result.outcome]));
    expect((await repos.adjustments.list(ROSEWOOD_ORG_ID)).map((a) => a.id)).toEqual(b.adjustments.map((a) => a.id));
    expect(Object.keys(await repos.ledgerSides.map(ROSEWOOD_ORG_ID)).sort()).toEqual(Object.keys(b.ledgerSides).sort());
    expect((await repos.audit.list(ROSEWOOD_ORG_ID)).length).toBeGreaterThan(40);

    // Harbor House sees none of it.
    expect(await repos.findings.list(HARBOR_ORG_ID)).toEqual([]);
    expect(await repos.interventions.evals(HARBOR_ORG_ID)).toEqual([]);
    expect((await loadRegister(db, HARBOR_ORG_ID)).services).toEqual([]);
    expect((await repos.feeds.list(HARBOR_ORG_ID)).length).toBeGreaterThan(0);
    expect(await repos.findings.get(HARBOR_ORG_ID, "F-CMP-OAK-DINNER")).toBeUndefined();
  });

  it("seeds personas whose demo passwords verify and whose scopes are real", async () => {
    const db = await freshDb();
    await seedDemo(db);
    const identity = createIdentityRepositories(db);
    const rose = await identity.userByEmail("rose@rosewood.example");
    expect(rose).toBeDefined();
    const [acct] = await db.select().from(accounts);
    expect(acct?.providerId).toBe("credential");
    const maria = await identity.userByEmail("maria@rosewood.example");
    const m = await identity.membershipForUser(maria!.id);
    expect(m?.role).toBe("gm");
    const repos = createRepositories(db);
    expect(await repos.memberships.scopes(ROSEWOOD_ORG_ID, m!.id)).toEqual(["oak"]);
    const admin = await identity.userByEmail("admin@streamline.example");
    expect(await identity.isSkcAdmin(admin!.id)).toBe(true);
    expect(await identity.membershipForUser(admin!.id)).toBeUndefined();
    const all = await db.select().from(users);
    expect(all.length).toBe(PERSONAS.length);
    const rows = await db.select().from(accounts);
    const roseAcct = rows.find((a) => a.userId === rose!.id);
    expect(await verifyPassword({ password: "streamline-demo-2026", hash: roseAcct!.password! })).toBe(true);
    expect(await verifyPassword({ password: "wrong", hash: roseAcct!.password! })).toBe(false);
  });

  it("the nightly job on a freshly seeded database changes nothing", async () => {
    const db = await freshDb();
    await seedDemo(db);
    const repos = createRepositories(db);
    const before = await repos.audit.list(ROSEWOOD_ORG_ID);
    const r = await runNightly(db, ROSEWOOD_ORG_ID);
    expect(r.transitions).toBe(0);
    expect(r.fired).toBeGreaterThan(5);
    const after = await repos.audit.list(ROSEWOOD_ORG_ID);
    expect(after.length).toBe(before.length);
    const b = buildRosewood();
    const ivs = await repos.interventions.evals(ROSEWOOD_ORG_ID);
    expect(ivs.map((iv) => [iv.id, iv.state, iv.result.money?.cents ?? null])).toEqual(b.interventions.map((iv) => [iv.id, iv.state, iv.result.money?.cents ?? null]));
    const h = await runNightly(db, HARBOR_ORG_ID);
    expect(h.skipped).toBe("no register");
  });
});
