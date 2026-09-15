/**
 * The nightly job and the demo clock. The job reads the register FROM THE
 * DATABASE, runs the engine at the org's clock and persists what changed,
 * with an audit event for every transition. The clock advance lands the next
 * slice of synthetic register (what an ingestion would land) and then runs the
 * job. Nothing already verified is rewritten; a reversal or a decay is a row.
 */
import { addDays, deriveAdjustments, ENGINE_VERSION, evaluateIntervention, expireStale, feedHealth, daysBetween, numberAdjustments, runDetectionPass, type Adjustment, type FeedHealth, type InterventionDecl, type InterventionEval, type LedgerFinding, type PriorFinding, type UnnumberedAdjustment } from "@streamline/engine";
import { accrualInPeriod } from "@streamline/engine";
import { buildFeeds, closedPeriodFor, FIXTURE, generateCanonical, ledgerSideFor } from "@streamline/fixture";
import { rollupRegister } from "@streamline/engine";
import { insertRegisterRows, lastInvoiceWeek, loadRegister } from "./register.js";
import { createRepositories, type AuditInput, type StreamlineDb } from "./repositories.js";
import type { FeedRow, Org } from "./schema.js";

const SYSTEM = "System · nightly job";

/** Newest business date a feed has delivered, from its rule and the clock. */
export function feedNewest(row: Pick<FeedRow, "newestRule" | "newest">, org: Pick<Org, "asOf" | "registerThrough">): string | null {
  switch (row.newestRule) {
    case "pos":
      return org.registerThrough;
    case "today":
      return org.asOf;
    case "yesterday":
      return addDays(org.asOf, -1);
    case "two_days":
      return addDays(org.asOf, -2);
    case "none":
      return null;
    default:
      return row.newest && row.newest > org.asOf ? org.asOf : row.newest;
  }
}

export function feedHealthOf(rows: readonly FeedRow[], org: Pick<Org, "asOf" | "registerThrough">): FeedHealth[] {
  return rows.map((r) => feedHealth({ id: r.code, name: r.name, tier: r.tier as FeedHealth["tier"], access: r.access, cadence: r.cadence, slaHours: r.slaHours, fields: r.fields, stages: r.stages, newest: feedNewest(r, org), rows: r.rows, degraded: r.degraded, completeness: r.completeness }, org.asOf, daysBetween));
}

export interface NightlyResult {
  runId: string;
  asOf: string;
  fired: number;
  transitions: number;
  skipped?: string;
}

export async function runNightly(db: StreamlineDb, orgId: string, opts: { actor?: string } = {}): Promise<NightlyResult> {
  const repos = createRepositories(db);
  const org = await repos.orgs.findById(orgId);
  if (!org) throw new Error(`org ${orgId} not found`);
  const actor = opts.actor ?? SYSTEM;
  const run = await repos.pipelineRuns.start(orgId, { asOf: org.asOf, engineVersion: ENGINE_VERSION, fixtureVersion: org.fixtureVersion });
  const runId = run?.id ?? "";
  if (!org.registerThrough) {
    await repos.pipelineRuns.finish(orgId, runId, { findingsFired: 0, notes: "No register yet: baselines accumulating." });
    return { runId, asOf: org.asOf, fired: 0, transitions: 0, skipped: "no register" };
  }

  const asOf = org.asOf;
  const reg = await loadRegister(db, orgId);
  const feedRows = await repos.feeds.list(orgId);
  const feeds = feedHealthOf(feedRows, org);
  const audit: AuditInput[] = [];

  // Findings: prior state survives; evidence refreshes.
  const before = await repos.findings.list(orgId);
  const byId = new Map(before.map((f) => [f.id, f]));
  const prior = new Map<string, PriorFinding>();
  for (const f of before) if (!f.historical) prior.set(f.id, { state: f.state, stateReason: f.stateReason ?? null, detectedOn: f.detectedOn, decisionOpenedOn: f.decisionOpenedOn, expiresOn: f.expiresOn, convertedTo: f.convertedTo ?? null, rejection: f.rejection ?? null });
  const pass = runDetectionPass(reg, feeds, asOf, prior);
  const live = expireStale(pass.findings, asOf);
  const toWrite: LedgerFinding[] = [];
  for (const f of live) {
    const old = byId.get(f.id);
    if (!old) audit.push({ on: asOf, actor, entityKind: "finding", entityId: f.id, event: "detected", toState: f.state, reason: f.onset ? `Onset dated ${f.onset.onsetDate}; chart signalled ${f.onset.signalDate}.` : null });
    else if (old.state !== f.state) audit.push({ on: asOf, actor, entityKind: "finding", entityId: f.id, event: f.state, fromState: old.state, toState: f.state, reason: f.stateReason ?? null });
    toWrite.push(f);
  }
  await repos.findings.upsertMany(orgId, toWrite);

  // Interventions: re-evaluate every record at the clock; record verdicts and transitions.
  const rows = await repos.interventions.list(orgId);
  const evals: InterventionEval[] = [];
  for (const row of rows) {
    const decl = row.decl as InterventionDecl;
    const ev = evaluateIntervention(decl, reg, feeds, asOf);
    if (row.eval.state !== ev.state) audit.push({ on: asOf, actor: ev.state === "measuring" || ev.state === "executed" ? actor : "Verification decision service", entityKind: "intervention", entityId: ev.id, event: ev.state, fromState: row.eval.state, toState: ev.state, reason: ev.result.why });
    if (ev.windowClosed && (row.eval.result.outcome !== ev.result.outcome || !row.eval.windowClosed)) await repos.verificationResults.append(orgId, ev.id, asOf, ev.result);
    await repos.interventions.upsert(orgId, decl, ev, row.source as "history" | "product");
    evals.push(ev);
  }

  // Adjustments: derived, then numbered after what is already on the record.
  const existing = await repos.adjustments.list(orgId);
  const fresh: UnnumberedAdjustment[] = deriveAdjustments(evals, asOf);
  const disputes = existing.filter((a) => a.kind === "Dispute");
  const numbered: Adjustment[] = numberAdjustments(existing, [...fresh, ...disputes.map(({ id: _id, ...rest }) => rest)]);
  const knownIds = new Set(existing.map((a) => a.id));
  for (const a of numbered) if (!knownIds.has(a.id)) audit.push({ on: asOf, actor: a.by, entityKind: "adjustment", entityId: a.id, event: a.kind.toLowerCase(), toState: a.status, reason: a.reason, payload: { cents: a.cents, interventionId: a.interventionId } });
  await repos.adjustments.upsertMany(orgId, numbered);

  // Ledger sides for the last closed month (fixture stand-in for the accounting feed).
  const closed = closedPeriodFor(asOf);
  const sides: Record<string, ReturnType<typeof ledgerSideFor>> = {};
  const claims: Record<string, number> = {};
  for (const ev of evals) {
    if (!ev.result.money) continue;
    const claim = accrualInPeriod(ev, closed, asOf);
    if (claim <= 0) continue;
    const side = ledgerSideFor(ev, claim);
    if (!side) continue;
    sides[ev.id] = side;
    claims[ev.id] = claim;
  }
  await repos.ledgerSides.replace(orgId, closed.label, Object.fromEntries(Object.entries(sides).filter(([, v]) => v).map(([k, v]) => [k, v!])), claims);

  await repos.audit.appendMany(orgId, audit);
  await repos.pipelineRuns.finish(orgId, runId, { findingsFired: pass.fired.length, notes: `${audit.length} transitions.` });
  return { runId, asOf, fired: pass.fired.length, transitions: audit.length };
}

/**
 * Advance the demo clock: land the synthetic register through the day before
 * `toDate` (applying the changes executed inside the product), move the feeds'
 * newest dates with the clock, then run the nightly job.
 */
export async function advanceClock(db: StreamlineDb, orgId: string, toDate: string, opts: { actor?: string } = {}): Promise<NightlyResult> {
  const repos = createRepositories(db);
  const org = await repos.orgs.findById(orgId);
  if (!org) throw new Error(`org ${orgId} not found`);
  if (toDate <= org.asOf) throw new Error(`The clock only moves forward (${org.asOf} → ${toDate}).`);
  const through = addDays(toDate, -1);
  if (org.slug === "rosewood") {
    const rows = await repos.interventions.list(orgId);
    const applied = rows
      .filter((r) => r.source === "product")
      .map((r) => r.decl as InterventionDecl)
      .filter((d) => d.appliedChange && d.executionFidelity !== "not_started" && d.executionFidelity !== "unknown")
      .map((d) => ({ ...(d.appliedChange as NonNullable<InterventionDecl["appliedChange"]>), from: d.execOn }));
    const canonical = generateCanonical({ through, appliedChanges: applied });
    const reg = rollupRegister(canonical);
    const afterWeek = await lastInvoiceWeek(db, orgId);
    await insertRegisterRows(db, orgId, reg, { afterDate: org.registerThrough, afterWeek });
    const fresh = buildFeeds(canonical, toDate);
    for (const f of fresh) await repos.feeds.update(orgId, f.id, { rows: f.rows });
    await repos.orgs.setClock(orgId, { asOf: toDate, registerThrough: through });
  } else {
    await repos.orgs.setClock(orgId, { asOf: toDate });
  }
  await repos.audit.append(orgId, { on: toDate, actor: opts.actor ?? "Demo control", entityKind: "org", entityId: orgId, event: "clock_advanced", fromState: org.asOf, toState: toDate, reason: `Synthetic register extended through ${through}.` });
  return runNightly(db, orgId, opts);
}

export const FIXTURE_VERSION = FIXTURE.version;
