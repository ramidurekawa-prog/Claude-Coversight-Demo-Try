import type { ChangeDetailResponse, DataResponse, DecideFindingResponse, FindingDetailResponse, FindingsResponse, HomeResponse, MeResponse, ProofResponse, TodayResponse, CompleteActionResponse, AdvanceClockResponse } from "@streamline/contracts";
import { describe, expect, it } from "vitest";
import { createTestApp, get, post, signIn } from "../src/test-helpers.js";

const money = (v: unknown) => (v as { cents: number }).cents;

describe("api", () => {
  it("answers health without a session and refuses everything else", async () => {
    const { app } = await createTestApp();
    const h = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toMatchObject({ ok: true, db: "ok" });
    for (const url of ["/api/v1/me", "/api/v1/home", "/api/v1/findings", "/api/v1/proof", "/api/v1/data"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.statusCode, url).toBe(401);
    }
    const signup = await app.inject({ method: "POST", url: "/api/v1/auth/sign-up/email", payload: { email: "x@y.z", password: "hunter22222", name: "X" } });
    expect(signup.statusCode).toBe(404);
  });

  it("signs the owner in and serves every surface from the same build", async () => {
    const { app } = await createTestApp();
    const cookie = await signIn(app, "rose@rosewood.example");
    const me = await get<MeResponse>(app, cookie, "/api/v1/me");
    expect(me.status).toBe(200);
    expect(me.body.persona.role).toBe("owner");
    expect(me.body.org.synthetic).toBe(true);
    expect(me.body.org.asOf).toBe("2026-09-15");
    expect(me.body.locations.map((l) => l.code)).toEqual(["oak", "brk", "ala"]);

    const home = await get<HomeResponse>(app, cookie, "/api/v1/home");
    expect(home.status).toBe(200);
    expect(home.body.hero.persistent.value).toMatchObject({ klass: "bookable" });
    expect(home.body.hero.multiple.value as number).toBeGreaterThan(3);
    expect(home.body.loop.testsRunning.map((iv) => iv.id)).toContain("IV-07");
    expect(home.body.loop.winsDecaying.map((iv) => iv.id)).toEqual(["IV-03"]);
    expect(home.body.loop.decisionsDue.length).toBeGreaterThan(3);

    const today = await get<TodayResponse>(app, cookie, "/api/v1/today");
    expect(today.body.cards[0]?.type).toBe("guardrail");

    // The same finding shows the same recoverable figure on every surface.
    const findings = await get<FindingsResponse>(app, cookie, "/api/v1/findings?state=awaiting_decision");
    const comps = findings.body.findings.find((f) => f.id === "F-CMP-OAK-DINNER")!;
    const detail = await get<FindingDetailResponse>(app, cookie, "/api/v1/findings/F-CMP-OAK-DINNER");
    expect(detail.body.finding.recoverableCents).toBe(comps.recoverableCents);
    const card = today.body.cards.find((c) => c.ref.id === "F-CMP-OAK-DINNER")!;
    expect(card.moneyCents).toBe(comps.recoverableCents);
    expect(detail.body.proposal).toMatch(/Could save approximately/);
    expect(detail.body.allowedTransitions).toContain("accepted");
    expect(detail.body.audit.length).toBeGreaterThan(0);

    const recovery = await get<{ kpis: HomeResponse["kpis"] }>(app, cookie, "/api/v1/recovery");
    const persistentHome = money(home.body.kpis.find((k) => k.id === "persistent")!.value);
    const persistentRecovery = money(recovery.body.kpis.find((k) => k.id === "persistent")!.value);
    expect(persistentHome).toBe(persistentRecovery);

    const proof = await get<ProofResponse>(app, cookie, "/api/v1/proof");
    expect(proof.body.ledger.map((iv) => iv.id)).toContain("IV-10");
    expect(proof.body.adjustments.length).toBe(3);
    expect(proof.body.bridges.length).toBeGreaterThan(2);
    expect(proof.body.fee.periodCents).toBeLessThan(proof.body.fee.monthlyCents);
    expect(money(proof.body.kpis.find((k) => k.id === "persistent")!.value)).toBe(persistentHome);

    const change = await get<ChangeDetailResponse>(app, cookie, "/api/v1/changes/IV-01");
    expect(change.body.intervention.result.outcome).toBe("verified");
    expect(change.body.bridge?.status).toBe("reconciled");
    expect(change.body.confidenceWord).toBe("Reconciled");
    expect(change.body.outcomeSentence).toMatch(/billable at/);

    const data = await get<DataResponse>(app, cookie, "/api/v1/data");
    expect(data.body.feeds.find((f) => f.id === "reservations")?.stale).toBe(true);
    expect(data.body.blocked.map((f) => f.id)).toContain("F-TKT-ALA-DINNER");

    const packet = await get(app, cookie, "/api/v1/proof/IV-02/packet");
    expect(packet.status).toBe(200);
    const missing = await get(app, cookie, "/api/v1/findings/F-NOPE");
    expect(missing.status).toBe(404);
  });

  it("keeps tenants and location scopes apart", async () => {
    const { app } = await createTestApp();
    const elena = await signIn(app, "elena@harborhouse.example");
    const me = await get<MeResponse>(app, elena, "/api/v1/me");
    expect(me.body.org.name).toBe("Harbor House Group");
    const findings = await get<FindingsResponse>(app, elena, "/api/v1/findings");
    expect(findings.body.findings).toEqual([]);
    expect((await get(app, elena, "/api/v1/findings/F-CMP-OAK-DINNER")).status).toBe(404);
    expect((await get(app, elena, "/api/v1/changes/IV-01")).status).toBe(404);
    const home = await get<HomeResponse>(app, elena, "/api/v1/home");
    expect(home.body.baseline).toEqual({ deliveredDays: 9, requiredDays: 28 });
    expect(money(home.body.hero.persistent.value)).toBe(0);
    expect((await get(app, elena, "/api/v1/home?scope=oak")).status).toBe(404);

    const maria = await signIn(app, "maria@rosewood.example");
    const meM = await get<MeResponse>(app, maria, "/api/v1/me");
    expect(meM.body.scope).toEqual(["oak"]);
    expect((await get(app, maria, "/api/v1/home?scope=brk")).status).toBe(403);
    expect((await get(app, maria, "/api/v1/home?scope=all")).status).toBe(403);
    const own = await get<HomeResponse>(app, maria, "/api/v1/home");
    expect(own.status).toBe(200);
    expect((await get(app, maria, "/api/v1/findings/F-POR-BRK-SK01")).status).toBe(403);
    // The group-level chuck claim is apportioned: Oakland sees a third of it, never the whole.
    const rose = await signIn(app, "rose@rosewood.example");
    const all = await get<HomeResponse>(app, rose, "/api/v1/home");
    const perRoom = await Promise.all(["oak", "brk", "ala"].map((c) => get<HomeResponse>(app, rose, `/api/v1/home?scope=${c}`)));
    const sum = perRoom.reduce((a, r) => a + money(r.body.kpis.find((k) => k.id === "persistent")!.value), 0);
    expect(sum).toBe(money(all.body.kpis.find((k) => k.id === "persistent")!.value));
    // Finance may read, never decide.
    const dana = await signIn(app, "dana@rosewood.example");
    expect((await post(app, dana, "/api/v1/findings/F-CMP-OAK-DINNER/decide", { decision: "accept" })).status).toBe(403);
  });

  it("runs the loop: accept → action → execute → measure → advance the clock → verdict", async () => {
    const { app } = await createTestApp();
    const rose = await signIn(app, "rose@rosewood.example");
    const bad = await post(app, rose, "/api/v1/findings/F-CMP-OAK-DINNER/decide", { decision: "reject" });
    expect(bad.status).toBe(400);
    const accepted = await post<DecideFindingResponse>(app, rose, "/api/v1/findings/F-CMP-OAK-DINNER/decide", { decision: "accept", dueOn: "2026-09-16" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.finding.state).toBe("converted");
    expect(accepted.body.finding.convertedTo).toBe("IV-11");
    expect(accepted.body.intervention?.state).toBe("approved");
    expect(accepted.body.intervention?.result.outcome).toBe("pending");
    expect(accepted.body.intervention?.plan.primary).toMatch(/Comps/);
    expect(accepted.body.intervention?.projectedCents).toBe(accepted.body.finding.recoverableCents);
    expect(accepted.body.action?.id).toBe("A-07");
    // A second accept is an illegal transition, not a second intervention.
    expect((await post(app, rose, "/api/v1/findings/F-CMP-OAK-DINNER/decide", { decision: "accept" })).status).toBe(409);
    // A blocked finding cannot be accepted.
    expect((await post(app, rose, "/api/v1/findings/F-TKT-ALA-DINNER/decide", { decision: "accept" })).status).toBe(409);
    // A rejection needs a code and a reason, and is remembered.
    const rej = await post<DecideFindingResponse>(app, rose, "/api/v1/findings/F-MIX-ALA/decide", { decision: "reject", code: "not_worth_effort", reason: "Menu reprint is due in November anyway." });
    expect(rej.status).toBe(200);
    expect(rej.body.finding.rejection?.code).toBe("not_worth_effort");
    const detail = await get<FindingDetailResponse>(app, rose, "/api/v1/findings/F-MIX-ALA");
    expect(detail.body.finding.state).toBe("rejected");
    expect(detail.body.audit.some((e) => e.event === "rejected" && e.actor.startsWith("Rose Jorge"))).toBe(true);

    // Execution: evidence is required; the window opens at executed, never at approval.
    expect((await post(app, rose, "/api/v1/actions/A-07/complete", { evidence: [] })).status).toBe(400);
    const done = await post<CompleteActionResponse>(app, rose, "/api/v1/actions/A-07/complete", { evidence: [{ type: "Register configuration diff", detail: "Toast approval threshold $1,000 → $25 at Oakland, 16 Sep" }], doneOn: "2026-09-16" });
    expect(done.status).toBe(200);
    expect(done.body.action.state).toBe("done");
    expect(done.body.intervention?.state).toBe("measuring");
    expect(done.body.intervention?.execOn).toBe("2026-09-16");
    expect((await post(app, rose, "/api/v1/actions/A-07/complete", { evidence: [{ type: "x", detail: "y" }] })).status).toBe(409);
    const home = await get<HomeResponse>(app, rose, "/api/v1/home");
    expect(home.body.loop.testsRunning.map((iv) => iv.id)).toContain("IV-11");
    expect(money(home.body.kpis.find((k) => k.id === "active")!.value)).toBe(accepted.body.intervention!.projectedCents + 29708);

    // The clock: only forward, owner or admin, and the register lands with the change applied.
    expect((await post(app, rose, "/api/v1/demo/advance", { toDate: "2026-09-01" })).status).toBe(400);
    const dana = await signIn(app, "dana@rosewood.example");
    expect((await post(app, dana, "/api/v1/demo/advance", { toDate: "2026-10-21" })).status).toBe(403);
    const adv = await post<AdvanceClockResponse>(app, rose, "/api/v1/demo/advance", { toDate: "2026-10-21" });
    expect(adv.status).toBe(200);
    expect(adv.body.asOf).toBe("2026-10-21");
    expect(adv.body.run.finishedAt).not.toBeNull();
    const after = await get<ChangeDetailResponse>(app, rose, "/api/v1/changes/IV-11");
    expect(after.body.intervention.windowClosed).toBe(true);
    expect(after.body.intervention.result.outcome).not.toBe("pending");
    expect(after.body.audit.some((e) => e.event === after.body.intervention.state)).toBe(true);
    const iv07 = await get<ChangeDetailResponse>(app, rose, "/api/v1/changes/IV-07");
    expect(iv07.body.intervention.windowClosed).toBe(true);
    const me = await get<MeResponse>(app, rose, "/api/v1/me");
    expect(me.body.org.asOf).toBe("2026-10-21");
    // Verdict and money for the comps change: the applied change is in the register, so the estimate is positive.
    expect(after.body.intervention.estimate?.point ?? 0).toBeGreaterThan(0);
  }, 180_000);
});
