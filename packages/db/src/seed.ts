/**
 * Seed: the Rosewood build, the Harbor House second tenant and the demo
 * personas. Idempotent and version-gated: a database carrying a different
 * fixture version or fingerprint is wiped for that org and re-seeded, never
 * mixed. Users are shared across orgs; memberships are per org.
 */
import { ENGINE_VERSION, type InterventionEval, type LedgerFinding } from "@streamline/engine";
import { buildHarbor, buildRosewood, FEED_STALENESS, FIXTURE, HARBOR_ORG, INVESTIGATIONS, LOCATIONS, PERSONAS, registerFingerprint, REJECTED_FINDING, ROSEWOOD_ORG_ID, rosewoodId, type Persona, type RosewoodBuild } from "@streamline/fixture";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "./password.js";
import { insertCatalogue, insertRegisterRows } from "./register.js";
import { createRepositories, type AuditInput, type StreamlineDb } from "./repositories.js";
import { accounts, actions, adjustments, auditEvents, dayparts, feeds, findings, gmLocationScopes, interventions, invoiceLines, itemDays, ledgerSides, locations, memberships, menuItems, orgs, pipelineRuns, reservationDays, roles, seedState, services, shifts, skcAdmins, skus, users, verificationResults } from "./schema.js";

export interface SeedResult {
  rosewood: "seeded" | "noop";
  harbor: "seeded" | "noop";
  personas: number;
}

/** Children before parents; every table is org-scoped so no join is needed. */
export async function deleteOrg(db: StreamlineDb, orgId: string): Promise<void> {
  for (const t of [auditEvents, verificationResults, ledgerSides, adjustments, actions, interventions, findings, feeds, pipelineRuns, seedState, reservationDays, invoiceLines, shifts, itemDays, services, roles, skus, menuItems, dayparts, gmLocationScopes, memberships, locations]) {
    await db.delete(t).where(eq(t.orgId, orgId));
  }
  await db.delete(orgs).where(eq(orgs.id, orgId));
}

function feedRule(code: string): string {
  const rule = FEED_STALENESS[code] ?? "pos";
  return ["pos", "today", "yesterday", "two_days"].includes(rule) ? rule : "fixed";
}

/** Every recorded transition, as the audit trail the product would have written at the time. */
export function historyAudit(b: Pick<RosewoodBuild, "findings" | "interventions" | "adjustments">): AuditInput[] {
  const out: AuditInput[] = [];
  for (const f of b.findings) {
    if (f.historical) {
      out.push({ on: f.detectedOn, actor: "System · detectors", entityKind: "finding", entityId: f.id, event: "detected", toState: "awaiting_decision", reason: null });
      const iv = b.interventions.find((x) => x.findingId === f.id);
      if (iv) out.push({ on: iv.decidedOn, actor: iv.approver, entityKind: "finding", entityId: f.id, event: "converted", fromState: "awaiting_decision", toState: "converted", reason: `Converted to ${iv.id}.` });
      continue;
    }
    out.push({ on: f.detectedOn, actor: "System · detectors", entityKind: "finding", entityId: f.id, event: "detected", toState: "detected", reason: f.onset ? `Onset dated ${f.onset.onsetDate}; chart signalled ${f.onset.signalDate}.` : null });
    if (f.state !== "detected" && f.state !== "data_insufficient") out.push({ on: f.decisionOpenedOn, actor: "System · qualification", entityKind: "finding", entityId: f.id, event: "qualified", fromState: "detected", toState: "awaiting_decision", reason: "Passed data, feasibility, recoverability and overlap tests." });
    if (f.state === "data_insufficient") out.push({ on: f.detectedOn, actor: "System · qualification", entityKind: "finding", entityId: f.id, event: "data_insufficient", fromState: "detected", toState: "data_insufficient", reason: f.stateReason ?? null });
    const inv = INVESTIGATIONS.find((i) => i.id === f.id);
    if (inv && f.state === "investigating") out.push({ on: inv.on, actor: inv.by, entityKind: "finding", entityId: f.id, event: "investigating", fromState: "awaiting_decision", toState: "investigating", reason: inv.reason });
    if (f.state === "rejected" && f.rejection) out.push({ on: f.rejection.on, actor: f.rejection.by, entityKind: "finding", entityId: f.id, event: "rejected", fromState: "awaiting_decision", toState: "rejected", reason: `${f.rejection.code}: ${f.rejection.reason}` });
    if (f.state === "converted" && f.convertedTo) {
      const iv = b.interventions.find((x) => x.id === f.convertedTo);
      out.push({ on: iv?.decidedOn ?? f.decisionOpenedOn, actor: iv?.approver ?? "System", entityKind: "finding", entityId: f.id, event: "converted", fromState: "awaiting_decision", toState: "converted", reason: `Converted to ${f.convertedTo}.` });
    }
    if (f.state === "expired") out.push({ on: f.expiresOn, actor: "System · nightly job", entityKind: "finding", entityId: f.id, event: "expired", fromState: "awaiting_decision", toState: "expired", reason: f.stateReason ?? null });
  }
  for (const iv of b.interventions) {
    let prev: string | null = null;
    for (const h of iv.history) {
      out.push({ on: h.on, actor: h.by, entityKind: "intervention", entityId: iv.id, event: h.state, fromState: prev, toState: h.state, reason: h.note });
      prev = h.state;
    }
  }
  for (const a of b.adjustments) out.push({ on: a.on, actor: a.by, entityKind: "adjustment", entityId: a.id, event: a.kind.toLowerCase(), toState: a.status, reason: a.reason, payload: { cents: a.cents, interventionId: a.interventionId } });
  return out.sort((x, y) => (x.on < y.on ? -1 : x.on > y.on ? 1 : 0));
}

async function insertRosewood(db: StreamlineDb, b: RosewoodBuild, fingerprint: string): Promise<void> {
  const orgId = b.org.id;
  const through = b.canonical.through;
  await db.insert(orgs).values({ id: orgId, slug: "rosewood", name: b.org.name, synthetic: true, fixtureVersion: b.fixture.version, fixtureLabel: b.fixture.label, asOf: b.asOf, registerThrough: through, connectedOn: "2026-03-02", feeMonthlyCents: b.org.feeMonthlyCents, feeNote: b.org.feeNote, fiscalCalendar: b.org.fiscalCalendar, pos: b.org.pos, currency: b.org.currency, ownerName: b.org.ownerName, controllerName: b.org.controllerName });
  await db.insert(locations).values(LOCATIONS.map((l) => ({ id: rosewoodId(`loc:${l.id}`), orgId, code: l.id, name: l.name, short: l.short, seats: l.seats, opened: l.opened, gm: l.gm, chef: l.chef, concept: l.concept, tz: l.tz, address: l.address })));
  await insertCatalogue(db, orgId, b.register);
  await insertRegisterRows(db, orgId, b.register);
  await db.insert(feeds).values(b.feeds.map((f) => ({ orgId, code: f.id, name: f.name, tier: f.tier, access: f.access, cadence: f.cadence, slaHours: f.slaHours, fields: f.fields, stages: f.stages, degraded: f.degraded, completeness: f.completeness, rows: f.rows, newest: f.newest, newestRule: feedRule(f.id) })));
  const repos = createRepositories(db);
  await repos.findings.upsertMany(orgId, b.findings);
  for (const iv of b.interventions) {
    const { id: _id, ...rest } = iv;
    void rest;
    await repos.interventions.upsert(orgId, declOf(iv), iv, "history");
  }
  for (const a of b.actions) await repos.actions.upsert(orgId, a, null);
  await repos.adjustments.upsertMany(orgId, b.adjustments);
  const claims: Record<string, number> = {};
  for (const iv of b.interventions) if (b.ledgerSides[iv.id]) claims[iv.id] = Math.round(b.ledgerSides[iv.id]!.observedCents + b.ledgerSides[iv.id]!.timingCents + b.ledgerSides[iv.id]!.unexplainedCents);
  await repos.ledgerSides.replace(orgId, b.closedPeriod.label, b.ledgerSides, claims);
  for (const iv of b.interventions) if (iv.windowClosed) await repos.verificationResults.append(orgId, iv.id, iv.eligibleOn, iv.result);
  await repos.audit.appendMany(orgId, historyAudit(b));
  const run = await repos.pipelineRuns.start(orgId, { asOf: b.asOf, engineVersion: ENGINE_VERSION, fixtureVersion: b.fixture.version });
  if (run) await repos.pipelineRuns.finish(orgId, run.id, { findingsFired: b.fired.length, notes: "Seed: fixture build persisted." });
  await repos.seedState.set(orgId, { fixtureVersion: b.fixture.version, fingerprint, through });
}

/** The frozen record is the declared part of an evaluation. */
export function declOf(iv: InterventionEval) {
  const { state, eligibleOn, windowClosed, observed, observedOf, series, rawEstimate, estimate, guardrailResults, dataQuality, result, persistence, persistenceSeries, realizedCents, weeksHeld, annualRunRateCents, reversedClaimCents, weeksBooked, adjustmentCents, history, ...decl } = iv;
  void [state, eligibleOn, windowClosed, observed, observedOf, series, rawEstimate, estimate, guardrailResults, dataQuality, result, persistence, persistenceSeries, realizedCents, weeksHeld, annualRunRateCents, reversedClaimCents, weeksBooked, adjustmentCents, history];
  return decl;
}

async function insertHarbor(db: StreamlineDb): Promise<void> {
  const h = buildHarbor();
  const orgId = h.org.id;
  await db.insert(orgs).values({ id: orgId, slug: "harbor", name: h.org.name, synthetic: true, fixtureVersion: FIXTURE.version, fixtureLabel: "Sample restaurant group · deterministic synthetic data · connected nine days ago", asOf: h.asOf, registerThrough: null, connectedOn: h.org.connectedOn, feeMonthlyCents: h.org.feeMonthlyCents, feeNote: h.org.feeNote, fiscalCalendar: h.org.fiscalCalendar, pos: h.org.pos, currency: h.org.currency, ownerName: h.org.ownerName, controllerName: h.org.controllerName });
  await db.insert(locations).values(h.locations.map((l) => ({ orgId, code: l.id, name: l.name, short: l.short, seats: l.seats, opened: l.opened, gm: l.gm, chef: l.chef, concept: l.concept, tz: "America/Los_Angeles", address: "558 Bridgeway, Sausalito, CA 94965" })));
  await db.insert(feeds).values(h.feeds.map((f) => ({ orgId, code: f.id, name: f.name, tier: f.tier, access: f.access, cadence: f.cadence, slaHours: f.slaHours, fields: f.fields, stages: f.stages, degraded: f.degraded, completeness: f.completeness, rows: f.rows, newest: f.newest, newestRule: f.newest ? "yesterday" : "none" })));
  const repos = createRepositories(db);
  await repos.audit.append(orgId, { on: h.org.connectedOn, actor: h.org.ownerName, entityKind: "org", entityId: orgId, event: "connected", reason: "Toast orders and labour connected. Baselines need 28 days before any detector may fire." });
  await repos.seedState.set(orgId, { fixtureVersion: FIXTURE.version, fingerprint: "none", through: "" });
}

export async function seedPersonas(db: StreamlineDb, orgIds: { rosewood: string; harbor: string }): Promise<number> {
  let n = 0;
  for (const p of PERSONAS) {
    const userId = rosewoodId(`user:${p.key}`);
    await db
      .insert(users)
      .values({ id: userId, name: p.name, email: p.email, emailVerified: true })
      .onConflictDoUpdate({ target: users.id, set: { name: p.name, email: p.email, emailVerified: true } });
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.insert(accounts).values({ id: rosewoodId(`account:${p.key}`), accountId: userId, providerId: "credential", userId, password: await hashPassword(p.password) });
    if (p.role === "admin") {
      await db.insert(skcAdmins).values({ id: rosewoodId(`admin:${p.key}`), userId }).onConflictDoNothing();
    } else if (p.org) {
      const orgId = orgIds[p.org];
      const [m] = await db
        .insert(memberships)
        .values({ id: rosewoodId(`membership:${p.key}`), orgId, userId, role: p.role, title: p.title })
        .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: p.role, title: p.title } })
        .returning();
      if (m && p.locations.length) {
        await db.delete(gmLocationScopes).where(eq(gmLocationScopes.membershipId, m.id));
        await db.insert(gmLocationScopes).values(p.locations.map((code) => ({ orgId, membershipId: m.id, locationCode: code })));
      }
    }
    n++;
  }
  return n;
}

export async function seedDemo(db: StreamlineDb, opts: { force?: boolean } = {}): Promise<SeedResult> {
  const repos = createRepositories(db);
  const b = buildRosewood();
  const fingerprint = registerFingerprint(b.register);
  let rosewood: SeedResult["rosewood"] = "noop";
  const existing = await repos.orgs.findBySlug("rosewood");
  const state = existing ? await repos.seedState.get(existing.id) : undefined;
  if (opts.force || !existing || !state || state.fixtureVersion !== b.fixture.version || state.fingerprint !== fingerprint) {
    await db.transaction(async (tx) => {
      if (existing) await deleteOrg(tx, existing.id);
      await insertRosewood(tx, b, fingerprint);
    });
    rosewood = "seeded";
  }
  let harbor: SeedResult["harbor"] = "noop";
  const existingHarbor = await repos.orgs.findBySlug("harbor");
  const harborState = existingHarbor ? await repos.seedState.get(existingHarbor.id) : undefined;
  if (opts.force || !existingHarbor || harborState?.fixtureVersion !== FIXTURE.version) {
    await db.transaction(async (tx) => {
      if (existingHarbor) await deleteOrg(tx, existingHarbor.id);
      await insertHarbor(tx);
    });
    harbor = "seeded";
  }
  const personas = await seedPersonas(db, { rosewood: ROSEWOOD_ORG_ID, harbor: HARBOR_ORG.id });
  return { rosewood, harbor, personas };
}

/** Re-seed one org from scratch (the demo "reset" control). */
export async function resetOrg(db: StreamlineDb, slug: "rosewood" | "harbor"): Promise<void> {
  const repos = createRepositories(db);
  const org = await repos.orgs.findBySlug(slug);
  await db.transaction(async (tx) => {
    if (org) await deleteOrg(tx, org.id);
    if (slug === "rosewood") {
      const b = buildRosewood();
      await insertRosewood(tx, b, registerFingerprint(b.register));
    } else await insertHarbor(tx);
  });
  await seedPersonas(db, { rosewood: ROSEWOOD_ORG_ID, harbor: HARBOR_ORG.id });
}

export const SEED_PERSONAS: readonly Persona[] = PERSONAS;
export { REJECTED_FINDING };
export type { LedgerFinding };
export const seededUserIds = () => PERSONAS.map((p) => rosewoodId(`user:${p.key}`));
export const rosewoodUserId = (key: string) => rosewoodId(`user:${key}`);
export { inArray };
