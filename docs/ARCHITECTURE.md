# Architecture

## Shape

pnpm monorepo, TypeScript throughout, one runnable process for the demo.

```
packages/engine     pure calculation core            (no I/O, no clock, no randomness)
packages/fixture    Rosewood synthetic register      (seeded generator + declared history)
packages/contracts  Zod schemas for the API          (shared by route handlers and UI)
packages/db         SQLite via better-sqlite3+drizzle (schema, migrations, repos, seed, clock, jobs)
apps/web            Next.js App Router               (UI + /api/v1 route handlers)
e2e                 Playwright                        (demo flow, desktop + mobile)
```

Dependency direction is strict: `engine ← fixture ← db ← web`. `contracts` depends on nothing.

## How a dollar travels

1. **Register** — `fixture` generates canonical rows in integer cents, location-local business dates:
   `services` (location × date × daypart), `item_days`, `shifts`, `invoices`, `reservations`. Signals
   are planted in the data, not in the detectors.
2. **Detection** — `engine/detectors` reads the register and runs seven detectors on control charts
   (EWMA/CUSUM with a stated false-alarm rate, naming the onset day). Output: findings with detector,
   scope key, account, observed vs baseline, exposure (estimated), ranked causes, remedy with artifact,
   guardrails, equations used, feeds cited.
3. **Overlap** — `engine/overlap` tests every candidate against every open/verified claim on
   intersecting scope, period and account; precedence rules 1–5 allocate; unresolved blocks both.
4. **Qualification** — data sufficiency, feasibility, recoverability, overlap. Only qualified findings
   may show a recoverable figure. Exposure × lever recovery factor − overlap deduction = recoverable.
5. **Decision** — operator accepts (owner + due date) → `action` (a task) + `intervention` (a controlled
   change with a **frozen measurement plan**: primary metric, unit of analysis, baseline/window lengths,
   comparison population, guardrails, MDE, stop conditions, persistence schedule, attribution rung).
6. **Execution** — action marked done with evidence → execution fidelity (complete / modified /
   partial / not started / unknown). The measurement clock starts at *executed*, never at approval.
7. **Monitoring** — checkpoints accumulate per week on the primary outcome and every guardrail.
8. **Measurement** — at window close `engine/measure` runs DiD (Family B/C) or direct reconciliation
   (Family A) with a placebo parallel-trends test and a pre-computed MDE. Effects are scaled to
   cents/week from observed post-window volume.
9. **Verification** — `engine/verify.verificationService()` produces one of ten outcomes. Only it may
   call `mint()`, which returns the conservative lower bound net of incremental cost and unresolved
   overlap as `bookable` money. Failed gates, guardrail breaches, inconclusive, no-effect, negative,
   data failure, attribution conflict are stored permanently and rendered.
10. **Ledger** — `engine/ledger` accrues realized value daily from the weekly bookable rate,
    decayed by persistence class; reversals and decay append adjustments and are never netted.
    Fifteen KPIs, twelve conversion metrics, the funnel, and the queue are all computed here, once,
    for a (scope, asOf).
11. **Serve** — `db` repositories load the org's rows (always by `orgId`), the API route handlers call
    the engine and validate responses against `contracts`, and the UI renders. The UI never computes
    a dollar.

## The demo clock

Every org row carries `as_of` (business date, default 2026-09-15). "Advance clock" (owner/admin only,
labelled as a synthetic-data control) extends the register deterministically through the new date,
applies the effects of executed interventions to the generated rows, then runs the "nightly job":
re-run detectors, open/close windows, run verification, update persistence, append adjustments and
audit events. Nothing about existing verified rows changes retroactively; a reversal is a new row.

## Data model (packages/db)

Tenant-scoped tables (every one has `org_id`; every repository method takes `orgId` first):

- `orgs`, `locations`, `users` (persona + role), `sessions`
- register: `services`, `item_days`, `shifts`, `invoices`, `reservations`, `menu_items`, `skus`, `roles`
- `feeds` (freshness derived from delivered data at read time, completeness stored)
- `findings` (record per System 8; state machine with 11 states; reason codes; overlap refs)
- `actions` (task: owner, due, done, evidence)
- `interventions` (record per System 9; 18 states; frozen `plan` JSON; execution evidence)
- `checkpoints` (per intervention per week: primary + guardrails)
- `verifications` (append-only: estimate, gates, outcome, bookable, reason)
- `adjustments` (append-only: reversal, decay, dispute)
- `audit_events` (append-only)
- `demo_clock` (per org)

Drizzle migrations in `packages/db/drizzle`; `pnpm db:seed` builds the fixture and persists it.

## API (apps/web/app/api/v1)

All routes require a session cookie (persona sign-in) and resolve `orgId` from the session. Query
`scope=all|<locationId>` where relevant. Responses validated with `contracts`.

```
GET  /api/v1/health
POST /api/v1/session            { persona }        sign in as a demo persona (Rosewood)
DEL  /api/v1/session
GET  /api/v1/home               ledger headline + loop sections + data confidence
GET  /api/v1/today              queue cards (ranked by policy)
GET  /api/v1/recovery           funnel + conversions + pipeline + ledger summary
GET  /api/v1/findings           list (state, scope, sort)
GET  /api/v1/findings/:id       full record + evidence series + confidence profile
POST /api/v1/findings/:id/decide  { decision: accept|reject, reason?, owner, due } → action + intervention
GET  /api/v1/actions            list
POST /api/v1/actions/:id/complete { evidence[] } → execution fidelity, window opens
GET  /api/v1/changes            interventions list
GET  /api/v1/changes/:id        plan, series, estimate, gates, guardrails, outcome, persistence, bridge
GET  /api/v1/proof              savings ledger, accrual, adjustments, run rate, multiple, bridges
GET  /api/v1/proof/:id/packet   proof packet (JSON; UI renders printable)
GET  /api/v1/data               feeds, freshness, completeness, dollars at risk, blocked items
POST /api/v1/demo/advance       { days } advance the demo clock (owner/admin), runs the nightly job
POST /api/v1/demo/reset         reseed this org (owner/admin)
```

## Auth and tenancy

Demo sign-in picks a persona (owner / GM / finance / admin) for the Rosewood org; the server issues an
HttpOnly, signed session cookie. A second org ("Harbor House Group", one location) is seeded with its
own persona so tenant tests are meaningful: every repository query filters by `org_id`, and API tests
assert cross-org reads return 404. Personas change navigation emphasis and permitted actions
(accept/approve/reverse/export), never a number.

## Engine purity

`packages/engine/src` may not import node built-ins, db, fixture, next or react, may not reference
`Date`, `Math.random`, `process`, timers or `fetch`. ESLint rules enforce it, and
`test/purity-guard.test.ts` greps the source so the rule is mechanical.

## What is real, simulated, or interface-only (mirrors the About drawer)

| Capability | Status |
| --- | --- |
| Detection (EWMA/CUSUM), measurement (DiD + placebo), reconciliation, gates, mint, overlap, persistence, ledger, state machines, confidence | Implemented, runs on the register |
| The register (sales, labour, invoices), feed freshness/completeness | Simulated from the seeded fixture; realistic, not real |
| P&L bridge / reconciliation | Bridge arithmetic implemented; ledger side is fixture data |
| POS / scheduling / accounting connectors, write-back | Interface only; nothing is contacted |
| LLM features | None |

## Deviations from the specification (deliberate, documented)

- SQLite instead of Postgres; route handlers instead of Fastify; nightly job runs on clock advance
  instead of pg-boss. Same contracts, same engine, same tenancy discipline.
- Screens are the eight priority surfaces; Menu/Labour/Throughput/Purchasing analysis screens are
  reached through finding detail rather than as standalone surfaces.
