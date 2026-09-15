/**
 * All tenant data access goes through here, and every method takes the org id
 * first. A query without a tenant predicate is a bug. Financial rows
 * (verification results, adjustments, audit events) are append-only: there is
 * no delete, deliberately.
 */
import type { Adjustment, EvidenceItem, InterventionDecl, InterventionEval, LedgerAction, LedgerFinding, LedgerSide, VerificationResult } from "@streamline/engine";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { actions, adjustments, auditEvents, feeds, findings, gmLocationScopes, interventions, ledgerSides, locations, memberships, orgs, pipelineRuns, seedState, verificationResults, type FeedRow } from "./schema";

/** Any Postgres-dialect Drizzle database: node-postgres in prod, PGlite in dev and tests. */
export type StreamlineDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

const first = <T>(rows: T[]): T | undefined => rows[0];

export interface AuditInput {
  on: string;
  actor: string;
  actorUserId?: string | null;
  entityKind: "finding" | "intervention" | "action" | "adjustment" | "feed" | "org";
  entityId: string;
  event: string;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
}

export function createRepositories(db: StreamlineDb) {
  return {
    orgs: {
      findById: async (orgId: string) => first(await db.select().from(orgs).where(eq(orgs.id, orgId))),
      findBySlug: async (slug: string) => first(await db.select().from(orgs).where(eq(orgs.slug, slug))),
      list: () => db.select().from(orgs).orderBy(asc(orgs.name)),
      setClock: async (orgId: string, patch: { asOf: string; registerThrough?: string | null }) => {
        await db.update(orgs).set(patch).where(eq(orgs.id, orgId));
      },
    },
    locations: {
      rows: (orgId: string) => db.select().from(locations).where(eq(locations.orgId, orgId)).orderBy(asc(locations.opened)),
    },
    feeds: {
      list: (orgId: string): Promise<FeedRow[]> => db.select().from(feeds).where(eq(feeds.orgId, orgId)).orderBy(asc(feeds.createdAt)),
      update: async (orgId: string, code: string, patch: Partial<Pick<FeedRow, "newest" | "newestRule" | "rows" | "completeness">>) => {
        await db.update(feeds).set(patch).where(and(eq(feeds.orgId, orgId), eq(feeds.code, code)));
      },
    },
    findings: {
      list: async (orgId: string, opts: { state?: string; historical?: boolean } = {}): Promise<LedgerFinding[]> => {
        const rows = await db
          .select({ record: findings.record })
          .from(findings)
          .where(and(eq(findings.orgId, orgId), opts.state ? eq(findings.state, opts.state) : undefined, opts.historical === undefined ? undefined : eq(findings.historical, opts.historical)))
          .orderBy(desc(findings.recoverableCents));
        return rows.map((r) => r.record);
      },
      get: async (orgId: string, id: string): Promise<LedgerFinding | undefined> => first(await db.select({ record: findings.record }).from(findings).where(and(eq(findings.orgId, orgId), eq(findings.id, id))))?.record,
      upsertMany: async (orgId: string, list: readonly LedgerFinding[]) => {
        for (const f of list) {
          const values = { orgId, id: f.id, state: f.state, lever: f.lever, domain: f.domain, loc: f.loc, exposureCents: f.exposureCents, recoverableCents: f.recoverableCents, detectedOn: f.detectedOn, decisionOpenedOn: f.decisionOpenedOn, expiresOn: f.expiresOn, historical: f.historical ?? false, convertedTo: f.convertedTo ?? null, record: f };
          await db
            .insert(findings)
            .values(values)
            .onConflictDoUpdate({ target: [findings.orgId, findings.id], set: { ...values, updatedAt: new Date() } });
        }
      },
    },
    interventions: {
      list: async (orgId: string) => db.select().from(interventions).where(eq(interventions.orgId, orgId)).orderBy(asc(interventions.id)),
      evals: async (orgId: string): Promise<InterventionEval[]> => (await db.select({ eval: interventions.eval }).from(interventions).where(eq(interventions.orgId, orgId)).orderBy(asc(interventions.id))).map((r) => r.eval),
      get: async (orgId: string, id: string) => first(await db.select().from(interventions).where(and(eq(interventions.orgId, orgId), eq(interventions.id, id)))),
      upsert: async (orgId: string, decl: InterventionDecl, ev: InterventionEval, source: "history" | "product") => {
        const values = { orgId, id: decl.id, findingId: decl.findingId, state: ev.state, lever: decl.lever, loc: decl.loc, execOn: decl.execOn, eligibleOn: ev.eligibleOn, outcome: ev.result.outcome, bookableCents: ev.result.money?.cents ?? null, projectedCents: decl.projectedCents, source, decl, eval: ev };
        await db
          .insert(interventions)
          .values(values)
          .onConflictDoUpdate({ target: [interventions.orgId, interventions.id], set: { ...values, updatedAt: new Date() } });
      },
      nextId: async (orgId: string) => {
        const rows = await db.select({ id: interventions.id }).from(interventions).where(eq(interventions.orgId, orgId));
        const n = rows.reduce((m, r) => Math.max(m, Number(r.id.replace(/^IV-/, "")) || 0), 0) + 1;
        return `IV-${String(n).padStart(2, "0")}`;
      },
    },
    actions: {
      list: async (orgId: string): Promise<LedgerAction[]> => (await db.select({ record: actions.record }).from(actions).where(eq(actions.orgId, orgId)).orderBy(asc(actions.dueOn), asc(actions.id))).map((r) => r.record),
      get: async (orgId: string, id: string) => first(await db.select().from(actions).where(and(eq(actions.orgId, orgId), eq(actions.id, id)))),
      upsert: async (orgId: string, a: LedgerAction, evidence?: EvidenceItem[] | null) => {
        const values = { orgId, id: a.id, interventionId: a.interventionId, findingId: a.findingId ?? null, state: a.state, owner: a.owner, dueOn: a.dueOn, doneOn: a.doneOn ?? null, loc: a.loc, record: a, ...(evidence !== undefined ? { evidence } : {}) };
        await db
          .insert(actions)
          .values(values)
          .onConflictDoUpdate({ target: [actions.orgId, actions.id], set: { ...values, updatedAt: new Date() } });
      },
      nextId: async (orgId: string) => {
        const rows = await db.select({ id: actions.id }).from(actions).where(eq(actions.orgId, orgId));
        const n = rows.reduce((m, r) => Math.max(m, Number(r.id.replace(/^A-/, "")) || 0), 0) + 1;
        return `A-${String(n).padStart(2, "0")}`;
      },
    },
    adjustments: {
      list: async (orgId: string): Promise<Adjustment[]> => (await db.select({ record: adjustments.record }).from(adjustments).where(eq(adjustments.orgId, orgId)).orderBy(asc(adjustments.id))).map((r) => r.record),
      /** Append-only: a new id is inserted; an existing id may only restate its figure and status. */
      upsertMany: async (orgId: string, list: readonly Adjustment[]) => {
        for (const a of list) {
          const values = { orgId, id: a.id, kind: a.kind, interventionId: a.interventionId, cents: a.cents, status: a.status, on: a.on, record: a };
          await db
            .insert(adjustments)
            .values(values)
            .onConflictDoUpdate({ target: [adjustments.orgId, adjustments.id], set: { cents: a.cents, status: a.status, record: a, updatedAt: new Date() } });
        }
      },
    },
    verificationResults: {
      append: async (orgId: string, interventionId: string, asOf: string, result: VerificationResult) => {
        await db.insert(verificationResults).values({ orgId, interventionId, asOf, outcome: result.outcome, bookableCents: result.money?.cents ?? null, result });
      },
      list: (orgId: string, interventionId: string) => db.select().from(verificationResults).where(and(eq(verificationResults.orgId, orgId), eq(verificationResults.interventionId, interventionId))).orderBy(asc(verificationResults.createdAt)),
    },
    ledgerSides: {
      map: async (orgId: string): Promise<Record<string, LedgerSide>> => Object.fromEntries((await db.select().from(ledgerSides).where(eq(ledgerSides.orgId, orgId))).map((r) => [r.interventionId, r.record])),
      claims: async (orgId: string): Promise<Record<string, number>> => Object.fromEntries((await db.select().from(ledgerSides).where(eq(ledgerSides.orgId, orgId))).map((r) => [r.interventionId, r.claimCents])),
      replace: async (orgId: string, period: string, sides: Record<string, LedgerSide>, claims: Record<string, number>) => {
        await db.delete(ledgerSides).where(eq(ledgerSides.orgId, orgId));
        for (const [interventionId, record] of Object.entries(sides)) await db.insert(ledgerSides).values({ orgId, interventionId, period, claimCents: claims[interventionId] ?? 0, record });
      },
    },
    audit: {
      append: async (orgId: string, e: AuditInput) => first(await db.insert(auditEvents).values({ id: uuidv7(), orgId, on: e.on, actor: e.actor, actorUserId: e.actorUserId ?? null, entityKind: e.entityKind, entityId: e.entityId, event: e.event, fromState: e.fromState ?? null, toState: e.toState ?? null, reason: e.reason ?? null, payload: e.payload ?? null }).returning()),
      appendMany: async (orgId: string, list: readonly AuditInput[]) => {
        for (const e of list) await db.insert(auditEvents).values({ id: uuidv7(), orgId, on: e.on, actor: e.actor, actorUserId: e.actorUserId ?? null, entityKind: e.entityKind, entityId: e.entityId, event: e.event, fromState: e.fromState ?? null, toState: e.toState ?? null, reason: e.reason ?? null, payload: e.payload ?? null });
      },
      list: (orgId: string, opts: { entityKind?: string; entityId?: string; limit?: number } = {}) =>
        db
          .select()
          .from(auditEvents)
          .where(and(eq(auditEvents.orgId, orgId), opts.entityKind ? eq(auditEvents.entityKind, opts.entityKind) : undefined, opts.entityId ? eq(auditEvents.entityId, opts.entityId) : undefined))
          .orderBy(asc(auditEvents.on), asc(auditEvents.at))
          .limit(opts.limit ?? 500),
    },
    pipelineRuns: {
      start: async (orgId: string, v: { asOf: string; engineVersion: string; fixtureVersion?: string | null }) => first(await db.insert(pipelineRuns).values({ orgId, asOf: v.asOf, engineVersion: v.engineVersion, fixtureVersion: v.fixtureVersion ?? null }).returning()),
      finish: async (orgId: string, id: string, patch: { findingsFired: number; notes?: string | null }) => first(await db.update(pipelineRuns).set({ finishedAt: new Date(), findingsFired: patch.findingsFired, notes: patch.notes ?? null }).where(and(eq(pipelineRuns.orgId, orgId), eq(pipelineRuns.id, id))).returning()),
      list: (orgId: string) => db.select().from(pipelineRuns).where(eq(pipelineRuns.orgId, orgId)).orderBy(desc(pipelineRuns.startedAt)).limit(50),
    },
    seedState: {
      get: async (orgId: string) => first(await db.select().from(seedState).where(eq(seedState.orgId, orgId))),
      set: async (orgId: string, v: { fixtureVersion: string; fingerprint: string; through: string }) => {
        await db
          .insert(seedState)
          .values({ orgId, ...v, seededAt: new Date() })
          .onConflictDoUpdate({ target: seedState.orgId, set: { ...v, seededAt: new Date() } });
      },
    },
    memberships: {
      listByOrg: (orgId: string) => db.select().from(memberships).where(eq(memberships.orgId, orgId)),
      scopes: async (orgId: string, membershipId: string) => (await db.select().from(gmLocationScopes).where(and(eq(gmLocationScopes.orgId, orgId), eq(gmLocationScopes.membershipId, membershipId)))).map((s) => s.locationCode),
    },
    counts: async (orgId: string) => {
      const [f] = await db.select({ n: sql<number>`count(*)::int` }).from(findings).where(eq(findings.orgId, orgId));
      const [i] = await db.select({ n: sql<number>`count(*)::int` }).from(interventions).where(eq(interventions.orgId, orgId));
      return { findings: f?.n ?? 0, interventions: i?.n ?? 0 };
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
