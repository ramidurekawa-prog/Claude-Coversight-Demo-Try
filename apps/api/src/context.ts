/**
 * One load per request: the org's loop records at its own clock, shaped into
 * the engine's LedgerInput for the requested scope. Every route reads the same
 * object, so two screens can never disagree.
 */
import { createRepositories, feedHealthOf, locationFromRow, type StreamlineDb } from "@streamline/db";
import type { Adjustment, FeedHealth, InterventionEval, LedgerAction, LedgerFinding, LedgerInput, LedgerSide, Location, Period } from "@streamline/engine";
import { closedPeriodFor, periodFor } from "@streamline/fixture";
import type { Org } from "@streamline/db";
import type { AuthContext } from "./auth/require-auth";

export interface OrgContext {
  org: Org;
  asOf: string;
  locations: Location[];
  feeds: FeedHealth[];
  findings: LedgerFinding[];
  interventions: InterventionEval[];
  actions: LedgerAction[];
  adjustments: Adjustment[];
  ledgerSides: Record<string, LedgerSide>;
  claims: Record<string, number>;
  period: Period;
  closedPeriod: Period;
  hasRegister: boolean;
}

export async function loadOrgContext(db: StreamlineDb, orgId: string): Promise<OrgContext> {
  const repos = createRepositories(db);
  const org = await repos.orgs.findById(orgId);
  if (!org) throw new Error(`org ${orgId} not found`);
  const [locRows, feedRows, findings, interventions, actions, adjustments, ledgerSides, claims] = await Promise.all([
    repos.locations.rows(orgId),
    repos.feeds.list(orgId),
    repos.findings.list(orgId),
    repos.interventions.evals(orgId),
    repos.actions.list(orgId),
    repos.adjustments.list(orgId),
    repos.ledgerSides.map(orgId),
    repos.ledgerSides.claims(orgId),
  ]);
  return {
    org,
    asOf: org.asOf,
    locations: locRows.map(locationFromRow),
    feeds: feedHealthOf(feedRows, org),
    findings,
    interventions,
    actions,
    adjustments,
    ledgerSides,
    claims,
    period: periodFor(org.asOf),
    closedPeriod: closedPeriodFor(org.asOf),
    hasRegister: !!org.registerThrough,
  };
}

export function ledgerInput(ctx: OrgContext, scope: string): LedgerInput {
  return { findings: ctx.findings, interventions: ctx.interventions, actions: ctx.actions, adjustments: ctx.adjustments, feeds: ctx.feeds, locations: ctx.locations, scope, feeMonthlyCents: ctx.org.feeMonthlyCents, asOf: ctx.asOf, period: ctx.period, ledgerSides: ctx.ledgerSides };
}

export type ScopeResult = { ok: true; scope: string; locs: string[] } | { ok: false; status: 403 | 404; error: string; message: string };

/**
 * The scope a request may read: an explicit `scope` must name a location in the
 * org (404) that the account may see (403 — refused, not redirected); absent, an
 * org-wide role sees everything and a GM sees their first room.
 */
export function resolveScope(requested: string | undefined, auth: AuthContext, locations: readonly Location[]): ScopeResult {
  const all = locations.map((l) => l.id);
  const allowed = auth.locationCodes === "all" ? all : auth.locationCodes.filter((c) => all.includes(c));
  if (requested && requested !== "all") {
    if (!all.includes(requested)) return { ok: false, status: 404, error: "not_found", message: `Unknown location: ${requested}` };
    if (!allowed.includes(requested)) return { ok: false, status: 403, error: "forbidden", message: "Location outside your assigned scope" };
    return { ok: true, scope: requested, locs: [requested] };
  }
  if (auth.locationCodes === "all") return { ok: true, scope: "all", locs: all };
  if (requested === "all") return { ok: false, status: 403, error: "forbidden", message: "The group view is outside your assigned scope" };
  const first = allowed[0];
  if (!first) return { ok: false, status: 404, error: "not_found", message: "No locations visible to this account" };
  return { ok: true, scope: first, locs: [first] };
}
