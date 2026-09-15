# Architecture

## Shape

pnpm monorepo, TypeScript 5.9 strict throughout. Two runnable processes for the demo (`pnpm dev`
starts both), no external services.

```
packages/engine     pure calculation core             (no I/O, no clock, no randomness)
packages/fixture    Rosewood synthetic register        (seeded generator + declared history + build)
packages/contracts  Zod schemas + thin parsing client  (shared by the API and the UI)
packages/ui         design tokens + primitives         (ported from the reference monorepo)
packages/db         Postgres-dialect Drizzle schema    (PGlite file-backed by default; DATABASE_URL → real Postgres)
apps/api            Fastify 5 + better-auth            (routes under /api/v1, org-scoped repositories, nightly job, demo clock)
apps/web            Next.js 16 App Router              (UI only; proxies /api/* to apps/api server-side)
e2e                 Playwright 1.56                    (demo flow, desktop + mobile)
```

Dependency direction is strict: `engine ← fixture ← db ← api`, `contracts ← web`, `ui ← web`. The web
app never imports `db` or `fixture`; it only talks to the API. See `docs/REFERENCE_COMPARISON.md`
for what was ported from the reference monorepo, what was rebuilt, and why.

## How a dollar travels

1. **Canonical rows** — `fixture` generates the same shape a Toast ingestion would land: `checks`,
   `order_items`, `shifts`, `reviews`, `reservations`, `invoice_lines`, `recipe_costs`, in integer
   cents on location-local business dates. Every row is a function of (seed, its own key), so
   extending the register to a later date never changes an earlier row. Signals are planted in the
   rows, not in the detectors. Rooms share weekly drivers (weather, a promotion, the market), so a
   sibling room is a usable control and not a coin toss.
2. **Rollup** — `engine/rollup.rollupRegister` turns canonical rows into the service-grain
   `Register` (services, item-days, shifts, invoices, reservation days). Detectors and estimators
   read the rollup only.
3. **Detection** — `engine/detectors` runs seven detectors on control charts (EWMA/CUSUM with a
   stated false-alarm rate; the onset day is a maximum-likelihood change-point, not the chart's first
   twitch). A comps rise stands down when the other rooms' pooled chart is breaching too; a mix drift
   is netted of the group's own mix move. Output: findings with detector, scope key, account,
   observed vs baseline, exposure (estimated), ranked causes, remedy with artifact, guardrails,
   equations used, feeds cited, and the cadence of their evidence.
4. **Pipeline** — `engine/pipeline.runDetectionPass` resolves overlap (PPV and portion on the same
   SKU intersect on the same pounds), qualifies, and assigns the initial state while **preserving
   prior lifecycle state**: a rejection, an investigation, a conversion survives re-detection. The
   decision window (45 days) opens when the finding could qualify, and only `awaiting_decision`
   expires.
5. **Decision** — operator accepts (owner + due date) → `action` (a task) + `intervention` (a
   controlled change with a **frozen measurement plan**).
6. **Execution** — action marked done with evidence → execution fidelity. The measurement clock starts
   at *executed*, never at approval.
7. **Measurement** — `engine/measure` runs DiD (Family B/C) or direct reconciliation (Family A) with
   a placebo parallel-trends test and a pre-computed MDE. Effects are scaled to cents/week from
   observed post-window volume. A portion lever is priced at the unit price frozen at execution:
   the quantity effect is the portion lever's, the price move is purchasing's.
8. **Verification** — `engine/verify.verificationService()` produces one of ten outcomes and is the
   only caller of `mint()`, which returns the lower bound net of incremental cost and unresolved
   overlap as `bookable` money. "Could not tell" (MDE above the projection, or no valid control) and
   "did not work" (a powered null) are different outcomes; an under-powered positive is
   *directional*, never banked.
9. **Persistence and adjustments** — after verification the effect is re-estimated weekly; a decaying
   win changes state and appends a *Decay* adjustment; a reversal appends a *Reversal* adjustment
   beside the untouched original record; the controller's dispute of a bridge line is an open
   *Dispute*. Adjustments come out of evaluated interventions, never in.
10. **Ledger** — `engine/ledger` accrues realized value daily from the weekly bookable rate, decayed
    by persistence class. Fifteen KPIs, twelve conversion metrics, the funnel, dollars at risk per
    feed and the queue are computed once per (scope, asOf). Fees are prorated to the period they are
    compared with. A group-level claim is apportioned across rooms by largest remainder, so the
    per-room views add up to the group and no dollar appears in two rooms.
11. **Serve** — `db` repositories load the org's rows (always by `orgId`), `apps/api` threads the
    org's demo clock as `asOf` into the engine and validates responses against `contracts`, and the
    UI renders. The UI never computes a dollar.

## The fixture build (`packages/fixture/src/rosewood/build.ts`)

`buildRosewood({ asOf, appliedChanges, userInterventions, priorFindings })` is one deterministic
function: generate → rollup → feed health → detection pass with prior states → evaluate the ten
declared interventions (projected value recomputed from the recorded exposure through the lever's
recovery factor) → adjustments → ledger sides for the last closed month. The database seed persists
its output; the nightly job calls it again with the new clock and the states the product has
recorded. A pinned fingerprint test (`test/rosewood.test.ts`) fails whenever the generator changes,
so the change ships with a `FIXTURE.version` bump and a seeded database from an older version is
refused rather than mixed.

## The demo clock

Every org row carries `as_of` (business date; Rosewood starts on 2026-09-15). "Advance clock"
(owner/admin only, labelled as a synthetic-data control) extends the register deterministically,
applies the effects of executed interventions to the generated rows, then runs the nightly job:
re-run detectors, open/close windows, verify, update persistence, append adjustments and audit events.
Nothing about existing verified rows changes retroactively; a reversal is a new row.

## Data model (packages/db)

Postgres dialect via Drizzle. Every tenant table has `org_id`; every repository method takes `orgId`
first. Ported conventions from the reference: uuid primary keys, `created_at`/`updated_at`,
append-only financial tables, JSON columns for frozen plans and evidence.

- identity: `orgs` (with `as_of`, `fee_monthly_cents`), `locations`, `users`, `sessions`,
  `accounts`, `verifications` (better-auth), `memberships` (owner | gm | finance | admin),
  `gm_location_scopes`, `skc_admins`, `invites`
- canonical register: `menu_items`, `recipe_costs`, `skus`, `checks`, `order_items`, `shifts`,
  `reviews`, `reservations`, `invoice_lines`
- pipeline: `feeds`, `pipeline_runs`, `engine_versions`, `seed_state`
- loop: `findings` (11 states), `actions`, `interventions` (18 states, frozen `plan`),
  `checkpoints`, `verification_results` (append-only), `adjustments` (append-only),
  `audit_events` (append-only)

PGlite keeps the database as files under `packages/db/data/pglite` (git-ignored); setting
`DATABASE_URL` points the same schema at a real Postgres (docker-compose provided). Tests run on a
fresh in-memory PGlite per file.

## API (apps/api, mounted at /api/v1; the web app proxies /api/*)

All routes require a session (better-auth cookie; invite-only sign-up; demo personas seeded) and
resolve `orgId` from the membership. GMs are scoped to their locations. Query `scope=all|<locationId>`
where relevant. Responses validated with `contracts`.

```
GET  /api/v1/health
GET  /api/v1/me                 persona, org, role, location scope, demo clock
GET  /api/v1/home               ledger headline + loop sections + data confidence
GET  /api/v1/today              queue cards (ranked by policy)
GET  /api/v1/recovery           funnel + conversions + pipeline + ledger summary
GET  /api/v1/findings           list (state, scope, sort)
GET  /api/v1/findings/:id       full record + evidence series + confidence profile
POST /api/v1/findings/:id/decide  { decision: accept|reject|investigate, reason?, owner, due } → action + intervention
GET  /api/v1/actions            list
POST /api/v1/actions/:id/complete { evidence[] } → execution fidelity, window opens
GET  /api/v1/changes            interventions list
GET  /api/v1/changes/:id        plan, series, estimate, gates, guardrails, outcome, persistence, bridge
GET  /api/v1/proof              savings ledger, accrual, adjustments, run rate, multiple, bridges
GET  /api/v1/proof/:id/packet   proof packet (JSON; UI renders printable)
GET  /api/v1/data               feeds, freshness, completeness, dollars at risk, blocked items
POST /api/v1/demo/advance       { toDate } advance the demo clock (owner/admin), runs the nightly job
POST /api/v1/demo/reset         reseed this org (owner/admin)
```

## Auth and tenancy

better-auth with email + password (argon2), invite-only; the seed creates the demo personas with a
published demo password. A second org ("Harbor House Group", one room, connected nine days ago, no
findings) is seeded with its own owner so tenant tests are meaningful and every empty state is real:
repository queries filter by `org_id`, and API tests assert cross-org reads return 404. Personas
change navigation emphasis and permitted actions (accept/approve/reverse/export), never a number.

## Engine purity

`packages/engine/src` may not import node built-ins, db, fixture, next or react, may not reference
`Date`, `Math.random`, `process`, timers or `fetch`. ESLint rules enforce it, and
`test/purity-guard.test.ts` greps the source so the rule is mechanical.

## What is real, simulated, or interface-only (mirrors the About drawer)

| Capability | Status |
| --- | --- |
| Detection (EWMA/CUSUM + change-point), measurement (DiD + placebo), reconciliation, gates, mint, overlap, persistence, ledger, state machines, confidence | Implemented, runs on the register |
| The register (checks, lines, shifts, invoices, reviews, reservations), feed freshness/completeness | Simulated from the seeded fixture; realistic, not real |
| P&L bridge / reconciliation | Bridge arithmetic implemented; the ledger side is fixture data standing in for the accounting feed |
| Toast ingestion (raw events, cursors, normalisation) | Reference implementation exists; port scheduled as milestone 7, not needed for the demo |
| POS / scheduling / accounting connectors, write-back | Interface only; nothing is contacted |
| LLM features | None |

## Deviations from the specification (deliberate, documented)

- The nightly job runs on clock advance and on seed rather than under pg-boss: the demo needs the
  loop to close in minutes, and it keeps the engine's `asOf` discipline explicit.
- Screens are the eight priority surfaces; Menu/Labour/Throughput/Purchasing analysis screens are
  reached through finding detail rather than as standalone surfaces.
- Group-level claims are apportioned equally across the rooms they cover in per-room views (the
  spec allows proportional apportionment; equal split is the transparent default and is named in
  the metric contract).
