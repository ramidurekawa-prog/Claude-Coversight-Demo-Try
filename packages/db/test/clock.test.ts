import { HARBOR_ORG_ID, ROSEWOOD_ORG_ID } from "@streamline/fixture";
import { describe, expect, it } from "vitest";
import { advanceClock, feedHealthOf } from "../src/nightly.js";
import { loadRegister, servicesAfter } from "../src/register.js";
import { createRepositories } from "../src/repositories.js";
import { seedDemo } from "../src/seed.js";
import { freshDb } from "../src/test-helpers.js";

describe("the demo clock", () => {
  it("lands the next slice of register, closes the open window and verifies it", async () => {
    const db = await freshDb();
    await seedDemo(db);
    const repos = createRepositories(db);
    const beforeAdj = await repos.adjustments.list(ROSEWOOD_ORG_ID);
    const beforeIv07 = await repos.interventions.get(ROSEWOOD_ORG_ID, "IV-07");
    expect(beforeIv07?.eval.state).toBe("measuring");

    const r = await advanceClock(db, ROSEWOOD_ORG_ID, "2026-10-07");
    expect(r.asOf).toBe("2026-10-07");
    const org = await repos.orgs.findById(ROSEWOOD_ORG_ID);
    expect(org?.registerThrough).toBe("2026-10-06");
    expect(await servicesAfter(db, ROSEWOOD_ORG_ID, "2026-09-14")).toBe(3 * 2 * 22);
    const reg = await loadRegister(db, ROSEWOOD_ORG_ID);
    expect(reg.services.filter((s) => s.date <= "2026-09-14").length).toBe(2186);

    const iv07 = await repos.interventions.get(ROSEWOOD_ORG_ID, "IV-07");
    expect(iv07?.eval.windowClosed).toBe(true);
    expect(iv07?.eval.result.outcome).not.toBe("pending");
    expect(["verified", "verified_limited", "directional", "inconclusive", "no_effect"]).toContain(iv07?.eval.result.outcome);
    const verdicts = await repos.verificationResults.list(ROSEWOOD_ORG_ID, "IV-07");
    expect(verdicts.length).toBe(1);
    expect(verdicts[0]?.asOf).toBe("2026-10-07");

    // Earlier records keep their identity: adjustments are appended, never renumbered.
    const afterAdj = await repos.adjustments.list(ROSEWOOD_ORG_ID);
    for (const a of beforeAdj) expect(afterAdj.find((x) => x.id === a.id)?.interventionId).toBe(a.interventionId);
    // The verified claims are still verified.
    for (const id of ["IV-01", "IV-02"]) expect((await repos.interventions.get(ROSEWOOD_ORG_ID, id))?.eval.result.money).not.toBeNull();

    // Feeds follow the clock; the deliberately stale one stays stale.
    const feeds = feedHealthOf(await repos.feeds.list(ROSEWOOD_ORG_ID), org!);
    expect(feeds.find((f) => f.id === "toast_orders")?.newest).toBe("2026-10-06");
    expect(feeds.find((f) => f.id === "reservations")?.stale).toBe(true);

    const audit = await repos.audit.list(ROSEWOOD_ORG_ID, { entityKind: "intervention", entityId: "IV-07" });
    expect(audit.some((e) => e.event === iv07?.eval.state && e.on === "2026-10-07")).toBe(true);
    const runs = await repos.pipelineRuns.list(ROSEWOOD_ORG_ID);
    expect(runs[0]?.finishedAt).not.toBeNull();
  });

  it("refuses to move backwards and moves an empty tenant's clock without a register", async () => {
    const db = await freshDb();
    await seedDemo(db);
    await expect(advanceClock(db, ROSEWOOD_ORG_ID, "2026-09-01")).rejects.toThrow(/forward/);
    const h = await advanceClock(db, HARBOR_ORG_ID, "2026-09-20");
    expect(h.skipped).toBe("no register");
    const repos = createRepositories(db);
    expect((await repos.orgs.findById(HARBOR_ORG_ID))?.asOf).toBe("2026-09-20");
  });
});
