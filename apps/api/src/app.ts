/**
 * The API. Every route resolves the org from the session, loads the org's loop
 * records at its own clock, calls the engine, and validates the response
 * against the contract before it leaves. Nothing here computes a dollar.
 */
import { ActionsResponse, AdvanceClockBody, AdvanceClockResponse, AuditQuery, AuditResponse, ChangeDetailResponse, ChangesResponse, CompleteActionBody, CompleteActionResponse, DataResponse, DecideFindingBody, DecideFindingResponse, FindingDetailResponse, FindingsQuery, FindingsResponse, HealthResponse, HomeResponse, MeResponse, ProofPacketResponse, ProofResponse, RecoveryResponse, ResetResponse, ScopeQuery, TodayResponse } from "@streamline/contracts";
import { advanceClock, createRepositories, declOf, resetOrg, type StreamlineDb } from "@streamline/db";
import { accrual, addDays, bridge, CALC_VERSION, canFindingTransition, conversions, daysBetween, daysInMonth, ENGINE_VERSION, evaluateIntervention, feedRisk, FINDING_STATES, FINDING_TRANSITIONS, findingConfidence, funnel, IllegalTransitionError, IN_FLIGHT_STATES, inScope, interventionConfidence, kpis, monthOf, plainOutcome, plainProposal, proposeIntervention, QUEUE_POLICY_VERSION, queue, confidenceWord, type FindingState, type InterventionDecl, type LedgerAction, type LedgerFinding } from "@streamline/engine";
import { loadRegister } from "@streamline/db";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z, ZodError } from "zod";
import { createAuth, type Auth, type AuthConfig } from "./auth/auth";
import { mountAuth } from "./auth/mount";
import { makeRequireAuth, requireRole } from "./auth/require-auth";
import { ledgerInput, loadOrgContext, resolveScope, type OrgContext } from "./context";
import { auditEvent, findingSummary, interventionSummary, pipelineRun } from "./projections";

export const API_VERSION = "0.1.0";

declare module "fastify" {
  interface FastifyInstance {
    auth: Auth;
  }
}

export interface BuildAppOptions {
  logger?: boolean;
  db?: StreamlineDb;
  dbPing?: () => Promise<void>;
  authConfig?: Partial<AuthConfig>;
}

/** Validate a payload against its contract AFTER a JSON round-trip (Infinity → null, Money → {cents, klass}). */
function contract<T>(reply: FastifyReply, schema: z.ZodType<T>, payload: unknown, status = 200) {
  const json: unknown = JSON.parse(JSON.stringify(payload));
  return reply.code(status).send(schema.parse(json));
}

const FINDING_CHAIN: FindingState[] = ["detected", "investigating", "qualified", "awaiting_decision", "accepted", "converted"];

/** The legal hops from one finding state to another, furthest legal hop first. */
function findingPath(from: FindingState, to: FindingState): FindingState[] {
  const steps: FindingState[] = [];
  let cur = from;
  const target = FINDING_CHAIN.indexOf(to);
  if (FINDING_CHAIN.indexOf(from) < 0 || target < 0) {
    const direct = canFindingTransition(from, to);
    if (!direct.ok) throw new IllegalTransitionError(from, to, direct.why ?? "no path");
    return [to];
  }
  while (cur !== to) {
    const idx = FINDING_CHAIN.indexOf(cur);
    let next: FindingState | null = null;
    for (let j = target; j > idx; j--) {
      const cand = FINDING_CHAIN[j] as FindingState;
      if (canFindingTransition(cur, cand).ok) {
        next = cand;
        break;
      }
    }
    if (!next) throw new IllegalTransitionError(cur, to, canFindingTransition(cur, to).why ?? "no path");
    steps.push(next);
    cur = next;
  }
  return steps;
}

/** The decisions a human may take from this state: the table's own edges, plus "accepted" wherever a legal path to converted exists. */
function decisionsFrom(state: FindingState): FindingState[] {
  const edges = [...(FINDING_TRANSITIONS[state] ?? [])];
  if (!edges.includes("accepted") && state !== "converted" && !FINDING_STATES[state].terminal) {
    try {
      findingPath(state, "converted");
      edges.push("accepted");
    } catch {
      /* no legal path */
    }
  }
  return edges;
}

export function buildApp({ logger = false, db, dbPing, authConfig }: BuildAppOptions = {}) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) return reply.code(400).send({ error: "validation_failed", message: "The request did not match its contract.", details: err.validation });
    if (err instanceof IllegalTransitionError) return reply.code(409).send({ error: "illegal_transition", message: err.message });
    if (err instanceof ZodError) {
      req.log.error({ issues: err.issues }, "response violated its contract");
      return reply.code(500).send({ error: "contract_violation", message: "A response did not match its contract.", details: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "internal" : "request_error", message: err.message });
  });

  app.get("/api/v1/health", async (_req, reply) => {
    let dbState: "ok" | "unavailable" = "unavailable";
    if (dbPing) {
      try {
        await dbPing();
        dbState = "ok";
      } catch {
        dbState = "unavailable";
      }
    } else if (db) dbState = "ok";
    return contract(reply, HealthResponse, { ok: true, version: API_VERSION, db: dbState });
  });

  if (!db) return app;

  const auth = createAuth(db, {
    secret: authConfig?.secret ?? "insecure-dev-only-secret-change-me",
    baseURL: authConfig?.baseURL ?? "http://localhost:3001",
    appBaseUrl: authConfig?.appBaseUrl ?? "http://localhost:3000",
  });
  app.decorate("auth", auth);
  mountAuth(app, auth);
  const requireAuth = makeRequireAuth({ auth, db });
  const repos = createRepositories(db);

  const scoped = async (req: FastifyRequest, reply: FastifyReply, requested: string | undefined) => {
    const ctx = await loadOrgContext(db, req.authContext.orgId);
    const sc = resolveScope(requested, req.authContext, ctx.locations);
    if (!sc.ok) {
      await reply.code(sc.status).send({ error: sc.error, message: sc.message });
      return null;
    }
    return { ctx, scope: sc.scope, locs: sc.locs };
  };
  const baselineOf = (ctx: OrgContext) => (ctx.hasRegister ? {} : { baseline: { deliveredDays: Math.max(0, ctx.org.connectedOn ? daysBetween(ctx.org.connectedOn, ctx.asOf) : 0), requiredDays: 28 } });
  const feeForPeriod = (ctx: OrgContext, scope: string) => {
    const days = daysBetween(ctx.period.from, ctx.period.to) + 1;
    return Math.round((ctx.org.feeMonthlyCents * (scope === "all" ? 1 : 1 / Math.max(ctx.locations.length, 1)) * days) / daysInMonth(monthOf(ctx.period.from)));
  };

  app.get("/api/v1/me", { preHandler: requireAuth }, async (req, reply) => {
    const a = req.authContext;
    const org = await repos.orgs.findById(a.orgId);
    if (!org) return reply.code(404).send({ error: "not_found", message: "Organisation not found" });
    const locs = await repos.locations.rows(a.orgId);
    return contract(reply, MeResponse, {
      user: a.user,
      persona: { role: a.role, title: a.title },
      org: { id: org.id, name: org.name, asOf: org.asOf, synthetic: org.synthetic, fixtureVersion: org.fixtureVersion, fixtureLabel: org.fixtureLabel, feeMonthlyCents: org.feeMonthlyCents, feeNote: org.feeNote, fiscalCalendar: org.fiscalCalendar, connectedOn: org.connectedOn },
      locations: locs.map((l) => ({ id: l.code, code: l.code, name: l.name, short: l.short, seats: l.seats, opened: l.opened, gm: l.gm, chef: l.chef, concept: l.concept })),
      scope: a.locationCodes,
      isAdmin: a.isAdmin,
    });
  });

  app.get("/api/v1/home", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const { ctx, scope, locs } = s;
    const input = ledgerInput(ctx, scope);
    const K = kpis(input);
    const cards = queue({ findings: ctx.findings, interventions: ctx.interventions, actions: ctx.actions, adjustments: ctx.adjustments, feeds: ctx.feeds, locs, asOf: ctx.asOf });
    const ivs = ctx.interventions.filter((iv) => inScope(iv, locs));
    const sum = (iv: (typeof ivs)[number]) => interventionSummary(iv, ctx.ledgerSides[iv.id]);
    const since = addDays(ctx.asOf, -42);
    const dq = K.find((k) => k.id === "dq");
    return contract(reply, HomeResponse, {
      asOf: ctx.asOf,
      period: ctx.period,
      kpis: K,
      hero: { persistent: K.find((k) => k.id === "persistent"), multiple: K.find((k) => k.id === "multiple") },
      loop: {
        decisionsDue: cards.filter((c) => ["guardrail", "overlap", "high_value", "verification_exception", "reversal", "persistence", "recon_question"].includes(c.type)),
        executionsDue: cards.filter((c) => ["action_due", "missing_evidence"].includes(c.type)),
        testsRunning: ivs.filter((iv) => IN_FLIGHT_STATES.includes(iv.state) && iv.executionFidelity !== "not_started").sort((a, b) => a.eligibleOn.localeCompare(b.eligibleOn)).map(sum),
        resultsLanded: ivs.filter((iv) => iv.windowClosed && iv.eligibleOn >= since).sort((a, b) => b.eligibleOn.localeCompare(a.eligibleOn)).map(sum),
        winsDecaying: ivs.filter((iv) => iv.persistence?.status === "decaying").map(sum),
      },
      dataConfidence: { value: typeof dq?.value === "number" ? dq.value : 0, feeds: ctx.feeds },
      ...baselineOf(ctx),
    });
  });

  app.get("/api/v1/today", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const { ctx, locs } = s;
    const cards = queue({ findings: ctx.findings, interventions: ctx.interventions, actions: ctx.actions, adjustments: ctx.adjustments, feeds: ctx.feeds, locs, asOf: ctx.asOf });
    return contract(reply, TodayResponse, { asOf: ctx.asOf, cards, policyVersion: QUEUE_POLICY_VERSION });
  });

  app.get("/api/v1/recovery", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const input = ledgerInput(s.ctx, s.scope);
    return contract(reply, RecoveryResponse, { asOf: s.ctx.asOf, period: s.ctx.period, funnel: funnel(input), conversions: conversions(input), kpis: kpis(input) });
  });

  app.get("/api/v1/findings", { preHandler: requireAuth, schema: { querystring: FindingsQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const { ctx, locs } = s;
    const list = ctx.findings
      .filter((f) => inScope(f, locs))
      .filter((f) => (req.query.state ? f.state === req.query.state : true))
      .filter((f) => (req.query.historical ? !!f.historical === (req.query.historical === "true") : true))
      .map((f) => findingSummary(f, ctx.feeds));
    return contract(reply, FindingsResponse, { asOf: ctx.asOf, findings: list });
  });

  app.get("/api/v1/findings/:id", { preHandler: requireAuth, schema: { params: z.object({ id: z.string() }) } }, async (req, reply) => {
    const ctx = await loadOrgContext(db, req.authContext.orgId);
    const f = ctx.findings.find((x) => x.id === req.params.id);
    if (!f) return reply.code(404).send({ error: "not_found", message: `Unknown finding: ${req.params.id}` });
    const sc = resolveScope(f.loc === "group" ? undefined : f.loc, req.authContext, ctx.locations);
    if (!sc.ok) return reply.code(sc.status).send({ error: sc.error, message: sc.message });
    const proposal = f.historical ? null : proposeIntervention(f, { id: "IV-00", owner: "", approver: "", decidedOn: ctx.asOf, dueOn: addDays(ctx.asOf, 7), locations: ctx.locations });
    const iv = f.convertedTo ? ctx.interventions.find((x) => x.id === f.convertedTo) : undefined;
    const audit = await repos.audit.list(ctx.org.id, { entityKind: "finding", entityId: f.id });
    return contract(reply, FindingDetailResponse, {
      asOf: ctx.asOf,
      finding: f,
      confidence: findingConfidence(f, ctx.feeds),
      confidenceWord: confidenceWord(findingConfidence(f, ctx.feeds)),
      proposal: proposal ? plainProposal({ plain: f.plain, recoverableCents: f.recoverableCents, guardrails: proposal.plan.guardrails, windowDays: proposal.plan.windowDays, comparison: proposal.plan.comparison }) : iv?.hypothesis ?? f.plain,
      overlapWith: f.overlapRefs.map((r) => ctx.findings.find((x) => x.id === r.id)).filter((x): x is LedgerFinding => !!x).map((x) => findingSummary(x, ctx.feeds)),
      intervention: iv ? interventionSummary(iv, ctx.ledgerSides[iv.id]) : null,
      allowedTransitions: decisionsFrom(f.state),
      audit: audit.map(auditEvent),
    });
  });

  app.post("/api/v1/findings/:id/decide", { preHandler: [requireAuth, requireRole("owner", "gm", "admin")], schema: { params: z.object({ id: z.string() }), body: DecideFindingBody } }, async (req, reply) => {
    const ctx = await loadOrgContext(db, req.authContext.orgId);
    const f = ctx.findings.find((x) => x.id === req.params.id);
    if (!f) return reply.code(404).send({ error: "not_found", message: `Unknown finding: ${req.params.id}` });
    const sc = resolveScope(f.loc === "group" ? undefined : f.loc, req.authContext, ctx.locations);
    if (!sc.ok) return reply.code(sc.status).send({ error: sc.error, message: sc.message });
    const actor = `${req.authContext.user.name} (${req.authContext.title || req.authContext.role})`;
    const body = req.body;
    const asOf = ctx.asOf;

    if (body.decision === "reject") {
      if (!body.code || !body.reason?.trim()) return reply.code(400).send({ error: "reason_required", message: "A rejection carries a reason code and a reason." });
      const t = canFindingTransition(f.state, "rejected");
      if (!t.ok) throw new IllegalTransitionError(f.state, "rejected", t.why ?? "no edge");
      const updated: LedgerFinding = { ...f, state: "rejected", stateReason: body.reason, rejection: { by: actor, on: asOf, code: body.code, reason: body.reason } };
      await repos.findings.upsertMany(ctx.org.id, [updated]);
      await repos.audit.append(ctx.org.id, { on: asOf, actor, actorUserId: req.authContext.user.id, entityKind: "finding", entityId: f.id, event: "rejected", fromState: f.state, toState: "rejected", reason: `${body.code}: ${body.reason}` });
      return contract(reply, DecideFindingResponse, { finding: updated, action: null, intervention: null });
    }

    if (body.decision === "investigate") {
      if (!body.reason?.trim()) return reply.code(400).send({ error: "reason_required", message: "An investigation carries a reason." });
      const t = canFindingTransition(f.state, "investigating");
      if (!t.ok) throw new IllegalTransitionError(f.state, "investigating", t.why ?? "no edge");
      const updated: LedgerFinding = { ...f, state: "investigating", stateReason: `${actor}, ${asOf}: ${body.reason}` };
      await repos.findings.upsertMany(ctx.org.id, [updated]);
      await repos.audit.append(ctx.org.id, { on: asOf, actor, actorUserId: req.authContext.user.id, entityKind: "finding", entityId: f.id, event: "investigating", fromState: f.state, toState: "investigating", reason: body.reason });
      return contract(reply, DecideFindingResponse, { finding: updated, action: null, intervention: null });
    }

    // Accept: approval tier by size; the action and the intervention are created together with a frozen plan.
    const tier: "Operator" | "Owner" = f.recoverableCents >= 25000 ? "Owner" : "Operator";
    if (tier === "Owner" && req.authContext.role === "gm") return reply.code(403).send({ error: "approval_tier", message: "This finding is above the operator tier: owner approval is required." });
    if (f.state === "converted" || FINDING_STATES[f.state].terminal) throw new IllegalTransitionError(f.state, "accepted", "this finding has already been decided");
    if (f.blockedBy) return reply.code(409).send({ error: "blocked", message: f.blockedBy.why });
    if (f.overlapStatus === "unresolved") return reply.code(409).send({ error: "overlap_unresolved", message: "Overlap with another claim is unresolved; both are blocked until it is allocated." });
    const steps = findingPath(f.state, "converted");
    const room = ctx.locations.find((l) => l.id === f.loc);
    const owner = body.owner?.trim() || (room ? `${room.gm} (GM, ${room.short})` : ctx.org.ownerName);
    const dueOn = body.dueOn ?? addDays(asOf, 7);
    const ivId = await repos.interventions.nextId(ctx.org.id);
    const actionId = await repos.actions.nextId(ctx.org.id);
    const sameVendorSkus = (await loadRegister(db, ctx.org.id)).skus;
    const controlSkus = f.sku ? sameVendorSkus.filter((s) => s.id !== f.sku && s.vendor === sameVendorSkus.find((x) => x.id === f.sku)?.vendor).map((s) => s.id).slice(0, 4) : [];
    const decl: InterventionDecl = proposeIntervention(f, { id: ivId, owner, approver: body.approver?.trim() || actor, approvalTier: tier, decidedOn: asOf, dueOn, locations: ctx.locations, controlSkus });
    const reg = await loadRegister(db, ctx.org.id);
    const ev = evaluateIntervention(decl, reg, ctx.feeds, asOf);
    const action: LedgerAction = { id: actionId, title: f.remedy.change, owner, dueOn, state: "open", loc: f.loc, interventionId: ivId, findingId: f.id, next: "Mark done with evidence", evidenceRequired: f.remedy.artifact, tier };
    const updated: LedgerFinding = { ...f, state: "converted", stateReason: `Converted to ${ivId} on ${asOf}.`, convertedTo: ivId };
    let prev: FindingState = f.state;
    const auditRows = steps.map((st) => {
      const row = { on: asOf, actor, actorUserId: req.authContext.user.id, entityKind: "finding" as const, entityId: f.id, event: st, fromState: prev, toState: st, reason: st === "converted" ? `Converted to ${ivId}; action ${actionId} assigned to ${owner}, due ${dueOn}.` : st === "accepted" ? (body.reason ?? "Accepted the recommendation.") : null };
      prev = st;
      return row;
    });
    await repos.findings.upsertMany(ctx.org.id, [updated]);
    await repos.interventions.upsert(ctx.org.id, decl, ev, "product");
    await repos.actions.upsert(ctx.org.id, action, null);
    await repos.audit.appendMany(ctx.org.id, [
      ...auditRows,
      { on: asOf, actor, actorUserId: req.authContext.user.id, entityKind: "intervention", entityId: ivId, event: "approved", fromState: null, toState: "approved", reason: `Approved at ${tier} tier. The measurement plan is now frozen: ${decl.plan.primary}, ${decl.plan.windowDays}-day window, compared with ${decl.plan.comparison.toLowerCase()}.` },
      { on: asOf, actor, actorUserId: req.authContext.user.id, entityKind: "action", entityId: actionId, event: "opened", fromState: null, toState: "open", reason: `Assigned to ${owner}, due ${dueOn}.` },
    ]);
    return contract(reply, DecideFindingResponse, { finding: updated, action, intervention: ev });
  });

  app.get("/api/v1/actions", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    return contract(reply, ActionsResponse, { asOf: s.ctx.asOf, actions: s.ctx.actions.filter((a) => inScope(a, s.locs)) });
  });

  app.post("/api/v1/actions/:id/complete", { preHandler: [requireAuth, requireRole("owner", "gm", "admin")], schema: { params: z.object({ id: z.string() }), body: CompleteActionBody } }, async (req, reply) => {
    const ctx = await loadOrgContext(db, req.authContext.orgId);
    const a = ctx.actions.find((x) => x.id === req.params.id);
    if (!a) return reply.code(404).send({ error: "not_found", message: `Unknown action: ${req.params.id}` });
    const sc = resolveScope(a.loc === "group" ? undefined : a.loc, req.authContext, ctx.locations);
    if (!sc.ok) return reply.code(sc.status).send({ error: sc.error, message: sc.message });
    if (a.state !== "open") return reply.code(409).send({ error: "illegal_transition", message: `Action ${a.id} is already ${a.state}.` });
    if (!req.body.evidence.length) return reply.code(400).send({ error: "evidence_required", message: `Evidence is required: ${a.evidenceRequired}` });
    const actor = `${req.authContext.user.name} (${req.authContext.title || req.authContext.role})`;
    const doneOn = req.body.doneOn ?? ctx.asOf;
    const evidence = req.body.evidence.map((e) => ({ type: e.type, detail: e.detail, resolved: e.resolved }));
    const done: LedgerAction = { ...a, state: "done", doneOn };
    await repos.actions.upsert(ctx.org.id, done, evidence);
    await repos.audit.append(ctx.org.id, { on: doneOn, actor, actorUserId: req.authContext.user.id, entityKind: "action", entityId: a.id, event: "done", fromState: "open", toState: "done", reason: evidence.map((e) => `${e.type}: ${e.detail}`).join("; "), payload: { evidence } });

    let ivOut = null;
    if (a.interventionId) {
      const row = await repos.interventions.get(ctx.org.id, a.interventionId);
      if (row && row.decl.executionFidelity === "not_started") {
        const decl: InterventionDecl = { ...row.decl, executionFidelity: "complete", execOn: doneOn, evidence: [...row.decl.evidence, ...evidence], lifecycleState: "executed", appliedChange: row.decl.appliedChange ? { ...row.decl.appliedChange, from: doneOn } : undefined };
        const reg = await loadRegister(db, ctx.org.id);
        const ev = evaluateIntervention(decl, reg, ctx.feeds, ctx.asOf);
        await repos.interventions.upsert(ctx.org.id, decl, ev, row.source as "history" | "product");
        await repos.audit.appendMany(ctx.org.id, [
          { on: doneOn, actor, actorUserId: req.authContext.user.id, entityKind: "intervention", entityId: decl.id, event: "executed", fromState: row.eval.state, toState: "executed", reason: "Execution evidence attached and resolved against the register." },
          { on: doneOn, actor: "System", entityKind: "intervention", entityId: decl.id, event: ev.state, fromState: "executed", toState: ev.state, reason: ev.state === "measuring" ? `Window open: ${decl.plan.windowDays} days from ${doneOn}; result on ${ev.eligibleOn}.` : ev.result.why },
        ]);
        ivOut = ev;
      }
    }
    // Reconnecting a feed: the feed follows the clock again from today.
    const m = /Reconnect the (\w[\w ]*?) feed/i.exec(a.title);
    if (m && m[1]) {
      const code = m[1].toLowerCase().replace(/\s+/g, "_");
      const feedRow = (await repos.feeds.list(ctx.org.id)).find((f) => f.code === code || f.name.toLowerCase().startsWith(m[1]!.toLowerCase()));
      if (feedRow) {
        await repos.feeds.update(ctx.org.id, feedRow.code, { newestRule: "yesterday", newest: addDays(ctx.asOf, -1) });
        await repos.audit.append(ctx.org.id, { on: doneOn, actor, actorUserId: req.authContext.user.id, entityKind: "feed", entityId: feedRow.code, event: "reconnected", reason: "Feed reconnected; freshness follows the clock again." });
      }
    }
    return contract(reply, CompleteActionResponse, { action: done, intervention: ivOut });
  });

  app.get("/api/v1/changes", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const list = s.ctx.interventions.filter((iv) => inScope(iv, s.locs)).map((iv) => interventionSummary(iv, s.ctx.ledgerSides[iv.id]));
    return contract(reply, ChangesResponse, { asOf: s.ctx.asOf, interventions: list });
  });

  const changeDetail = async (ctx: OrgContext, id: string) => {
    const iv = ctx.interventions.find((x) => x.id === id);
    if (!iv) return null;
    const side = ctx.ledgerSides[iv.id] ?? null;
    const claim = ctx.claims[iv.id] ?? 0;
    const conf = interventionConfidence(iv, side ? { status: side.status, note: side.explanation } : null);
    const f = ctx.findings.find((x) => x.id === iv.findingId) ?? null;
    const audit = (await repos.audit.list(ctx.org.id, { entityKind: "intervention", entityId: iv.id })).map(auditEvent);
    return { iv, side, bridge: side ? bridge(iv, claim, side) : null, conf, word: confidenceWord(conf), sentence: plainOutcome(iv), finding: f, actions: ctx.actions.filter((a) => a.interventionId === iv.id), adjustments: ctx.adjustments.filter((a) => a.interventionId === iv.id), audit };
  };

  app.get("/api/v1/changes/:id", { preHandler: requireAuth, schema: { params: z.object({ id: z.string() }) } }, async (req, reply) => {
    const ctx = await loadOrgContext(db, req.authContext.orgId);
    const d = await changeDetail(ctx, req.params.id);
    if (!d) return reply.code(404).send({ error: "not_found", message: `Unknown intervention: ${req.params.id}` });
    const sc = resolveScope(d.iv.loc === "group" ? undefined : d.iv.loc, req.authContext, ctx.locations);
    if (!sc.ok) return reply.code(sc.status).send({ error: sc.error, message: sc.message });
    return contract(reply, ChangeDetailResponse, { asOf: ctx.asOf, intervention: d.iv, confidence: d.conf, confidenceWord: d.word, outcomeSentence: d.sentence, bridge: d.bridge, ledgerSide: d.side, finding: d.finding ? findingSummary(d.finding, ctx.feeds) : null, actions: d.actions, adjustments: d.adjustments, audit: d.audit });
  });

  app.get("/api/v1/proof", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const { ctx, scope, locs } = s;
    const input = ledgerInput(ctx, scope);
    const ivs = ctx.interventions.filter((iv) => inScope(iv, locs));
    const ledger = ivs.filter((iv) => iv.result.money || iv.reversedClaimCents != null || iv.result.outcome === "reversed").sort((a, b) => (b.result.money?.cents ?? 0) - (a.result.money?.cents ?? 0)).map((iv) => interventionSummary(iv, ctx.ledgerSides[iv.id]));
    const bridges = ivs.filter((iv) => ctx.ledgerSides[iv.id]).map((iv) => ({ interventionId: iv.id, title: iv.title, bridge: bridge(iv, ctx.claims[iv.id] ?? 0, ctx.ledgerSides[iv.id]!) }));
    return contract(reply, ProofResponse, {
      asOf: ctx.asOf,
      period: ctx.period,
      closedPeriod: ctx.closedPeriod,
      kpis: kpis(input),
      ledger,
      accrual: accrual(input),
      adjustments: ctx.adjustments.filter((a) => inScope(a, locs)),
      bridges,
      fee: { monthlyCents: ctx.org.feeMonthlyCents, periodCents: feeForPeriod(ctx, scope), note: ctx.org.feeNote },
      versions: { engine: ENGINE_VERSION, calc: CALC_VERSION, fixture: ctx.org.fixtureVersion },
    });
  });

  app.get("/api/v1/proof/:id/packet", { preHandler: requireAuth, schema: { params: z.object({ id: z.string() }) } }, async (req, reply) => {
    const ctx = await loadOrgContext(db, req.authContext.orgId);
    const d = await changeDetail(ctx, req.params.id);
    if (!d) return reply.code(404).send({ error: "not_found", message: `Unknown intervention: ${req.params.id}` });
    const sc = resolveScope(d.iv.loc === "group" ? undefined : d.iv.loc, req.authContext, ctx.locations);
    if (!sc.ok) return reply.code(sc.status).send({ error: sc.error, message: sc.message });
    return contract(reply, ProofPacketResponse, { generatedOn: ctx.asOf, org: { name: ctx.org.name, synthetic: ctx.org.synthetic }, intervention: d.iv, finding: d.finding, bridge: d.bridge, ledgerSide: d.side, adjustments: d.adjustments, audit: d.audit, versions: { engine: ENGINE_VERSION, calc: CALC_VERSION, fixture: ctx.org.fixtureVersion }, confidence: d.conf, confidenceWord: d.word, outcomeSentence: d.sentence });
  });

  app.get("/api/v1/data", { preHandler: requireAuth, schema: { querystring: ScopeQuery } }, async (req, reply) => {
    const s = await scoped(req, reply, req.query.scope);
    if (!s) return;
    const { ctx, scope, locs } = s;
    const input = ledgerInput(ctx, scope);
    const dq = kpis(input).find((k) => k.id === "dq");
    return contract(reply, DataResponse, {
      asOf: ctx.asOf,
      feeds: ctx.feeds,
      risk: feedRisk(input),
      confidence: typeof dq?.value === "number" ? dq.value : 0,
      blocked: ctx.findings.filter((f) => f.state === "data_insufficient" && inScope(f, locs)).map((f) => findingSummary(f, ctx.feeds)),
      rowsDelivered: ctx.feeds.reduce((a, f) => a + f.rows, 0),
      ...baselineOf(ctx),
    });
  });

  app.get("/api/v1/audit", { preHandler: requireAuth, schema: { querystring: AuditQuery } }, async (req, reply) => {
    const rows = await repos.audit.list(req.authContext.orgId, { entityKind: req.query.entityKind, entityId: req.query.entityId, limit: req.query.limit ?? 200 });
    return contract(reply, AuditResponse, { events: rows.map(auditEvent) });
  });

  app.post("/api/v1/demo/advance", { preHandler: [requireAuth, requireRole("owner", "admin")], schema: { body: AdvanceClockBody } }, async (req, reply) => {
    const org = await repos.orgs.findById(req.authContext.orgId);
    if (!org?.synthetic) return reply.code(403).send({ error: "forbidden", message: "The clock only moves on synthetic data." });
    if (req.body.toDate <= org.asOf) return reply.code(400).send({ error: "clock_backwards", message: `The clock only moves forward (currently ${org.asOf}).` });
    if (daysBetween(org.asOf, req.body.toDate) > 120) return reply.code(400).send({ error: "clock_too_far", message: "Advance at most 120 days at a time." });
    const actor = `${req.authContext.user.name} (${req.authContext.title || req.authContext.role})`;
    const r = await advanceClock(db, org.id, req.body.toDate, { actor: `Demo control · ${actor}` });
    const runs = await repos.pipelineRuns.list(org.id);
    const run = runs.find((x) => x.id === r.runId) ?? runs[0];
    return contract(reply, AdvanceClockResponse, { asOf: r.asOf, run: run ? pipelineRun(run) : null });
  });

  app.post("/api/v1/demo/reset", { preHandler: [requireAuth, requireRole("owner", "admin")] }, async (req, reply) => {
    const org = await repos.orgs.findById(req.authContext.orgId);
    if (!org?.synthetic) return reply.code(403).send({ error: "forbidden", message: "Reset only applies to synthetic data." });
    await resetOrg(db, org.slug as "rosewood" | "harbor");
    const fresh = await repos.orgs.findById(org.id);
    return contract(reply, ResetResponse, { asOf: fresh?.asOf ?? org.asOf, seeded: true });
  });

  return app;
}

export { declOf };
