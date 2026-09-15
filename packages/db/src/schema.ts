/**
 * Postgres-dialect Drizzle schema. Conventions ported from the reference
 * monorepo: uuid v7 ids generated app-side, created_at/updated_at on every
 * table, org_id on every tenant-scoped table, money in integer cents, business
 * dates as ISO `YYYY-MM-DD` strings (location-local), timestamps stored UTC.
 *
 * Loop records (findings, interventions, actions, adjustments) are stored as
 * the engine's own JSON document beside the columns the API filters on, so a
 * screen never re-derives a number: it reads what the engine wrote.
 */
import type { Adjustment, AppliedChange, EvidenceItem, InterventionDecl, InterventionEval, LedgerAction, LedgerFinding, LedgerSide, VerificationResult } from "@streamline/engine";
import { boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};

const orgRef = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id);

/* ---------- tenancy ------------------------------------------------------- */

export const orgs = pgTable("orgs", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Every org in this build is synthetic; the flag is what the environment bar reads. */
  synthetic: boolean("synthetic").notNull().default(true),
  fixtureVersion: text("fixture_version"),
  fixtureLabel: text("fixture_label"),
  /** The demo clock: the business date the org is "on". */
  asOf: text("as_of").notNull(),
  /** Last complete business date landed in the register (null = no register yet). */
  registerThrough: text("register_through"),
  connectedOn: text("connected_on"),
  feeMonthlyCents: integer("fee_monthly_cents").notNull(),
  feeNote: text("fee_note").notNull().default(""),
  fiscalCalendar: text("fiscal_calendar").notNull().default("Calendar month, Mon–Sun weeks"),
  pos: text("pos").notNull().default("Toast"),
  currency: text("currency").notNull().default("USD"),
  ownerName: text("owner_name").notNull().default(""),
  controllerName: text("controller_name").notNull().default(""),
  ...timestamps,
});

export const locations = pgTable(
  "locations",
  {
    id: id(),
    orgId: orgRef(),
    /** Short stable code used throughout the engine ("oak"). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    short: text("short").notNull(),
    seats: integer("seats").notNull(),
    opened: text("opened").notNull(),
    gm: text("gm").notNull().default(""),
    chef: text("chef").notNull().default(""),
    concept: text("concept").notNull().default(""),
    tz: text("tz").notNull().default("America/Los_Angeles"),
    address: text("address"),
    ...timestamps,
  },
  (t) => [unique("locations_org_code_uniq").on(t.orgId, t.code)],
);

/* ---------- identity (better-auth core: only "who is this?") --------------- */

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    ...timestamps,
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

/* ---------- authorisation (ours, never better-auth's) ---------------------- */

export const memberRole = pgEnum("member_role", ["owner", "gm", "finance", "admin"]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRole("role").notNull(),
    title: text("title").notNull().default(""),
    ...timestamps,
  },
  (t) => [unique("memberships_org_user_uniq").on(t.orgId, t.userId)],
);

export const gmLocationScopes = pgTable(
  "gm_location_scopes",
  {
    id: id(),
    orgId: orgRef(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    locationCode: text("location_code").notNull(),
    ...timestamps,
  },
  (t) => [unique("gm_location_scopes_membership_location_uniq").on(t.membershipId, t.locationCode)],
);

/** Platform staff: a row with a timestamp, deliberately not an org membership. */
export const skcAdmins = pgTable("skc_admins", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  ...timestamps,
});

/* ---------- catalogue ------------------------------------------------------ */

export const dayparts = pgTable("dayparts", {
  id: id(),
  orgId: orgRef(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  startHour: integer("start_hour").notNull(),
  endHour: integer("end_hour").notNull(),
  hours: doublePrecision("hours").notNull(),
  ...timestamps,
}, (t) => [unique("dayparts_org_code_uniq").on(t.orgId, t.code)]);

export const menuItems = pgTable("menu_items", {
  id: id(),
  orgId: orgRef(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  costCents: integer("cost_cents"),
  priceHistory: jsonb("price_history").$type<Array<[string, number]>>().notNull(),
  usesSku: jsonb("uses_sku").$type<{ sku: string; qtyPerUnit: number } | null>(),
  ...timestamps,
}, (t) => [unique("menu_items_org_code_uniq").on(t.orgId, t.code)]);

export const skus = pgTable("skus", {
  id: id(),
  orgId: orgRef(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull(),
  unit: text("unit").notNull(),
  ...timestamps,
}, (t) => [unique("skus_org_code_uniq").on(t.orgId, t.code)]);

export const roles = pgTable("roles", {
  id: id(),
  orgId: orgRef(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  foh: boolean("foh").notNull(),
  loadedRateCents: integer("loaded_rate_cents").notNull(),
  ...timestamps,
}, (t) => [unique("roles_org_code_uniq").on(t.orgId, t.code)]);

/* ---------- the register (service grain, what the engine reads) ----------- */

export const services = pgTable(
  "services",
  {
    id: id(),
    orgId: orgRef(),
    locationCode: text("location_code").notNull(),
    businessDate: text("business_date").notNull(),
    dow: integer("dow").notNull(),
    daypart: text("daypart").notNull(),
    covers: integer("covers").notNull(),
    turnedAway: integer("turned_away").notNull().default(0),
    grossCents: integer("gross_cents").notNull(),
    compsCents: integer("comps_cents").notNull(),
    netCents: integer("net_cents").notNull(),
    cogsCents: integer("cogs_cents").notNull(),
    laborCents: integer("labor_cents").notNull(),
    hours: doublePrecision("hours").notNull(),
    ticketMin: doublePrecision("ticket_min").notNull(),
    rating: doublePrecision("rating").notNull(),
    constrainedShare: doublePrecision("constrained_share").notNull().default(0),
    holiday: boolean("holiday").notNull().default(false),
    capacity: integer("capacity").notNull().default(0),
  },
  (t) => [unique("services_org_loc_date_daypart_uniq").on(t.orgId, t.locationCode, t.businessDate, t.daypart), index("services_org_date_idx").on(t.orgId, t.businessDate)],
);

export const itemDays = pgTable(
  "item_days",
  {
    id: id(),
    orgId: orgRef(),
    locationCode: text("location_code").notNull(),
    businessDate: text("business_date").notNull(),
    daypart: text("daypart").notNull(),
    itemCode: text("item_code").notNull(),
    units: integer("units").notNull(),
    priceCents: integer("price_cents").notNull(),
    costCents: integer("cost_cents").notNull(),
  },
  (t) => [index("item_days_org_date_idx").on(t.orgId, t.businessDate)],
);

export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    orgId: orgRef(),
    locationCode: text("location_code").notNull(),
    businessDate: text("business_date").notNull(),
    daypart: text("daypart").notNull(),
    roleCode: text("role_code").notNull(),
    scheduledHours: doublePrecision("scheduled_hours").notNull(),
    clockedHours: doublePrecision("clocked_hours").notNull(),
    rateCents: integer("rate_cents").notNull(),
  },
  (t) => [index("shifts_org_date_idx").on(t.orgId, t.businessDate)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    orgId: orgRef(),
    locationCode: text("location_code").notNull(),
    /** Monday of the delivery week. */
    week: text("week").notNull(),
    skuCode: text("sku_code").notNull(),
    vendor: text("vendor").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    qty: doublePrecision("qty").notNull(),
    extendedCents: integer("extended_cents").notNull(),
  },
  (t) => [index("invoice_lines_org_week_idx").on(t.orgId, t.week)],
);

export const reservationDays = pgTable(
  "reservation_days",
  {
    id: id(),
    orgId: orgRef(),
    locationCode: text("location_code").notNull(),
    businessDate: text("business_date").notNull(),
    daypart: text("daypart").notNull(),
    booked: integer("booked").notNull(),
    walkIn: integer("walk_in").notNull(),
    quotedWaitMin: doublePrecision("quoted_wait_min").notNull(),
    abandoned: integer("abandoned").notNull(),
  },
  (t) => [index("reservation_days_org_date_idx").on(t.orgId, t.businessDate)],
);

/* ---------- feeds (Doctrine 11) -------------------------------------------- */

export const feeds = pgTable(
  "feeds",
  {
    id: id(),
    orgId: orgRef(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tier: text("tier").notNull(),
    access: text("access").notNull(),
    cadence: text("cadence").notNull(),
    slaHours: integer("sla_hours"),
    fields: text("fields").notNull(),
    stages: text("stages").notNull(),
    degraded: text("degraded").notNull(),
    completeness: doublePrecision("completeness").notNull(),
    rows: integer("rows").notNull().default(0),
    /** Newest business date delivered; null = never connected. */
    newest: text("newest"),
    /** How `newest` follows the clock: pos | today | yesterday | two_days | fixed | none. */
    newestRule: text("newest_rule").notNull().default("fixed"),
    ...timestamps,
  },
  (t) => [unique("feeds_org_code_uniq").on(t.orgId, t.code)],
);

/* ---------- the loop -------------------------------------------------------- */

export const findings = pgTable(
  "findings",
  {
    orgId: orgRef(),
    id: text("id").notNull(),
    state: text("state").notNull(),
    lever: text("lever").notNull(),
    domain: text("domain").notNull(),
    loc: text("loc").notNull(),
    exposureCents: integer("exposure_cents").notNull(),
    recoverableCents: integer("recoverable_cents").notNull(),
    detectedOn: text("detected_on").notNull(),
    decisionOpenedOn: text("decision_opened_on").notNull(),
    expiresOn: text("expires_on").notNull(),
    historical: boolean("historical").notNull().default(false),
    convertedTo: text("converted_to"),
    record: jsonb("record").$type<LedgerFinding>().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("findings_org_state_idx").on(t.orgId, t.state)],
);

export const interventions = pgTable(
  "interventions",
  {
    orgId: orgRef(),
    id: text("id").notNull(),
    findingId: text("finding_id").notNull(),
    state: text("state").notNull(),
    lever: text("lever").notNull(),
    loc: text("loc").notNull(),
    execOn: text("exec_on").notNull(),
    eligibleOn: text("eligible_on").notNull(),
    outcome: text("outcome").notNull(),
    bookableCents: integer("bookable_cents"),
    projectedCents: integer("projected_cents").notNull(),
    /** history = declared in the fixture; product = created inside the product. */
    source: text("source").notNull().default("history"),
    /** The frozen record: hypothesis, change, plan, evidence, applied change. */
    decl: jsonb("decl").$type<InterventionDecl>().notNull(),
    /** What the engine computed at the org's clock. */
    eval: jsonb("eval").$type<InterventionEval>().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("interventions_org_state_idx").on(t.orgId, t.state)],
);

export const actions = pgTable(
  "actions",
  {
    orgId: orgRef(),
    id: text("id").notNull(),
    interventionId: text("intervention_id"),
    findingId: text("finding_id"),
    state: text("state").notNull(),
    owner: text("owner").notNull(),
    dueOn: text("due_on").notNull(),
    doneOn: text("done_on"),
    loc: text("loc").notNull(),
    record: jsonb("record").$type<LedgerAction>().notNull(),
    evidence: jsonb("evidence").$type<EvidenceItem[]>(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.orgId, t.id] })],
);

/** Append-only: a reversal, a decay or a dispute is never deleted; a figure may be restated. */
export const adjustments = pgTable(
  "adjustments",
  {
    orgId: orgRef(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    interventionId: text("intervention_id").notNull(),
    cents: integer("cents").notNull(),
    status: text("status").notNull(),
    on: text("on").notNull(),
    record: jsonb("record").$type<Adjustment>().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.orgId, t.id] })],
);

/** Append-only: every verdict the decision service ever issued, with the clock it was issued at. */
export const verificationResults = pgTable(
  "verification_results",
  {
    id: id(),
    orgId: orgRef(),
    interventionId: text("intervention_id").notNull(),
    asOf: text("as_of").notNull(),
    outcome: text("outcome").notNull(),
    bookableCents: integer("bookable_cents"),
    result: jsonb("result").$type<VerificationResult>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_results_org_iv_idx").on(t.orgId, t.interventionId)],
);

export const ledgerSides = pgTable(
  "ledger_sides",
  {
    orgId: orgRef(),
    interventionId: text("intervention_id").notNull(),
    period: text("period").notNull(),
    claimCents: integer("claim_cents").notNull(),
    record: jsonb("record").$type<LedgerSide>().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.orgId, t.interventionId] })],
);

/** Append-only. Every state transition carries an actor, a business date, a reason where required. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    orgId: orgRef(),
    on: text("on").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    entityKind: text("entity_kind").notNull(),
    entityId: text("entity_id").notNull(),
    event: text("event").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    reason: text("reason"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_events_org_at_idx").on(t.orgId, t.at), index("audit_events_org_entity_idx").on(t.orgId, t.entityKind, t.entityId)],
);

export const pipelineRuns = pgTable("pipeline_runs", {
  id: id(),
  orgId: orgRef(),
  asOf: text("as_of").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  engineVersion: text("engine_version").notNull(),
  fixtureVersion: text("fixture_version"),
  findingsFired: integer("findings_fired").notNull().default(0),
  notes: text("notes"),
});

export const seedState = pgTable("seed_state", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id),
  fixtureVersion: text("fixture_version").notNull(),
  fingerprint: text("fingerprint").notNull(),
  through: text("through").notNull(),
  seededAt: timestamp("seeded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Org = typeof orgs.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type FeedRow = typeof feeds.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type InterventionRow = typeof interventions.$inferSelect;
export type ActionRow = typeof actions.$inferSelect;
export type AdjustmentRow = typeof adjustments.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AppliedChangeRecord = AppliedChange;
