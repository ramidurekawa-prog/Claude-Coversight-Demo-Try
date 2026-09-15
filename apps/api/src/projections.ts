import type { AuditEventRow, PipelineRunRow } from "@streamline/db";
import type { AuditEvent, FindingSummary, InterventionSummary, PipelineRun } from "@streamline/contracts";
import { confidenceWord, findingConfidence, interventionConfidence, VERIFICATION_OUTCOMES, type FeedHealth, type InterventionEval, type LedgerFinding, type LedgerSide } from "@streamline/engine";

export function findingSummary(f: LedgerFinding, feeds: readonly FeedHealth[]): FindingSummary {
  return {
    id: f.id,
    title: f.title,
    plain: f.plain,
    state: f.state,
    stateReason: f.stateReason ?? null,
    lever: f.lever,
    domain: f.domain,
    family: f.family,
    loc: f.loc,
    locs: f.locs,
    daypart: f.daypart,
    account: f.account,
    exposureCents: f.exposureCents,
    recoverableCents: f.recoverableCents,
    detectedOn: f.detectedOn,
    decisionOpenedOn: f.decisionOpenedOn,
    expiresOn: f.expiresOn,
    overlapStatus: f.overlapStatus,
    overlapDeductionCents: f.overlapDeductionCents,
    historical: !!f.historical,
    convertedTo: f.convertedTo ?? null,
    evPerHour: f.evPerHour,
    effortHours: f.effortHours,
    blockedBy: f.blockedBy ?? null,
    autonomy: f.autonomy,
    ...(f.claimCeiling ? { claimCeiling: f.claimCeiling } : {}),
    confidenceWord: confidenceWord(findingConfidence(f, feeds)),
  };
}

export function interventionSummary(iv: InterventionEval, side: LedgerSide | null | undefined): InterventionSummary {
  const recon = side ? { status: side.status, note: side.explanation } : null;
  return {
    id: iv.id,
    findingId: iv.findingId,
    title: iv.title,
    lever: iv.lever,
    family: iv.family,
    domain: iv.domain,
    loc: iv.loc,
    locs: iv.locs,
    daypart: iv.daypart,
    state: iv.state,
    outcome: iv.result.outcome,
    outcomeLabel: VERIFICATION_OUTCOMES[iv.result.outcome]?.label ?? iv.result.label,
    execOn: iv.execOn,
    eligibleOn: iv.eligibleOn,
    decidedOn: iv.decidedOn,
    windowClosed: iv.windowClosed,
    observed: iv.observed,
    observedOf: iv.observedOf,
    projectedCents: iv.projectedCents,
    bookableCents: iv.result.money?.cents ?? null,
    estimatePointCents: iv.estimate ? Math.round(iv.estimate.point) : null,
    estimateLowerCents: iv.estimate ? Math.round(iv.estimate.lower) : null,
    realizedCents: iv.realizedCents,
    annualRunRateCents: iv.annualRunRateCents,
    persistenceStatus: iv.persistence?.status ?? null,
    persistenceClass: iv.persistence?.cls ?? null,
    owner: iv.owner,
    approver: iv.approver,
    confidenceWord: confidenceWord(interventionConfidence(iv, recon)),
    reversed: iv.result.outcome === "reversed",
    reconStatus: side?.status ?? null,
  };
}

export function auditEvent(r: AuditEventRow): AuditEvent {
  return { id: r.id, orgId: r.orgId, on: r.on, at: r.at.toISOString(), actor: r.actor, entityKind: r.entityKind as AuditEvent["entityKind"], entityId: r.entityId, event: r.event, fromState: r.fromState, toState: r.toState, reason: r.reason, payload: r.payload };
}

export function pipelineRun(r: PipelineRunRow): PipelineRun {
  return { id: r.id, asOf: r.asOf, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null, engineVersion: r.engineVersion, fixtureVersion: r.fixtureVersion, findingsFired: r.findingsFired, notes: r.notes };
}
