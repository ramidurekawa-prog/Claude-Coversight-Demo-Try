# Streamline (by Coversight) — working demo

Closed-loop margin controller for multi-location full-service restaurant groups.
The product story the demo must tell in 10–15 minutes:

**DATA → FINDING → RECOMMENDATION → ACTION → EXECUTION → MEASUREMENT → VERIFIED RESULT → ROI PROOF**

Read `docs/DEMO_PLAN.md` (what we are building and why, living status), `docs/ARCHITECTURE.md`
(how it is built) and `docs/DEMO_TEST_CHECKLIST.md` (how we know it works) before changing anything.
The product/architecture specification is the "SKC Full layout" document supplied by the founder;
`docs/SPEC_NOTES.md` carries the extracted rules we build to.

## Commands

```
pnpm install            # once
pnpm db:seed            # build the synthetic Rosewood register + history into packages/db/data/pglite (the API also seeds on start)
pnpm demo               # PRESENT WITH THIS: production build, then API :3001 + web :3000
pnpm dev                # hot-reloading dev servers (API :3001, web :3000)
pnpm typecheck | pnpm lint | pnpm test | pnpm e2e
pnpm check              # typecheck + lint + unit/API tests + build (what CI runs)
pnpm db:reset           # delete and re-seed the demo database
```

Node ≥ 22.13, pnpm 10. No external services: the database is PGlite (in-process Postgres, files under
`packages/db/data/pglite`); set `DATABASE_URL` to use a real Postgres (`docker-compose.yml`). Chromium for
e2e is preinstalled in this environment (`@playwright/test` is pinned to 1.56.1 to match it).
`pnpm dev` starts the Fastify API on :3001 and Next.js on :3000.

## Workspaces (dependency direction is strict: engine ← fixture ← db ← api; contracts/ui ← web)

| Package | Owns | Rules |
| --- | --- | --- |
| `packages/engine` | All the maths: money classes, statistics, control charts, DiD/reconciliation estimators, gates, the mint, overlap engine, finding/intervention state machines, detectors, ledger, confidence, queue policy | **Pure.** No clock, no randomness, no I/O, no imports of db/fixture/next/react. Enforced by ESLint and `test/purity-guard.test.ts`. `asOf` is always an argument. |
| `packages/fixture` | The Rosewood Group synthetic canonical register (seeded, deterministic), the declared intervention history, `buildRosewood()`, the Harbor House second tenant, demo personas | The only place randomness exists, and it is seeded. Signals are *planted in the data*; detectors must find them. Changing the generator changes the pinned fingerprint: bump `FIXTURE.version` in the same commit. |
| `packages/contracts` | Zod schemas for every API response + thin parsing client | The web app never types an API response by hand. |
| `packages/ui` | Design tokens and primitives (ported from the reference) | No data fetching, no money arithmetic. |
| `packages/db` | Postgres-dialect Drizzle schema, migrations, org-scoped repositories, seed, PGlite/pg connection | Every repository method takes `orgId` first. A query without a tenant predicate is a bug. Financial rows (verification results, adjustments, audit) are append-only. |
| `apps/api` | Fastify 5 + better-auth; routes under `/api/v1/*`; the demo clock and the "nightly" job | Threads the org's `as_of` into every engine call. Validates every response against `contracts`. |
| `apps/web` | Next.js 16 App Router UI; proxies `/api/*` to `apps/api` | Nothing in the web layer computes a dollar. Every figure arrives from the engine carrying its claim class. Never imports `db` or `fixture`. |
| `e2e` | Playwright demo-flow tests (desktop + mobile) | The demo script in `docs/DEMO_PLAN.md` is executable here. |

## Non-negotiable rules (from the specification)

1. **Integer cents everywhere.** Money is `number` in cents, asserted integer at boundaries. Never a float dollar in state.
2. **Claim classes never mix.** Exposure, recoverable, projected/committed, measured, causal, verified, bookable, realized, maintained, adjustment are distinct `Money` classes; summing two classes throws. A screen shows one class per number and labels it.
3. **The mint is the only door to a bookable dollar.** `verificationService()` is the only caller of `mint()`. Nothing else, including the web layer and the seed, may create verified/bookable value. A failed gate cannot mint. Execution must be confirmed first.
4. **Reserved words.** `banked`, `realized`, `recovered`, `saved` only for realized-class figures. `guaranteed`, `certain`, `proven` never appear in product copy.
5. **No LLM in the arithmetic path.** No AI call computes, adjusts, or narrates a number that the customer is shown as a financial fact. (The demo has no LLM calls at all.)
6. **One source per number.** KPIs come from `engine/ledger` through the metric registry; two screens can never disagree because both read the same function with the same scope.
7. **No confidence badge without its basis.** Confidence is the eight-dimension profile; a compact word (Estimated / Directional / Measured / Verified / Persistent / Reconciled) always expands to the dimensions that produced it.
8. **Overlap is resolved, never ignored.** Two findings on intersecting scope/period/account are allocated under the precedence rules; unresolved blocks both.
9. **Every state transition carries an actor, a timestamp (business date), a reason where required, and an immutable audit event.**
10. **Synthetic data is labelled as synthetic.** Rosewood Group is a fixture. The UI says so in the environment bar and the About drawer.

## Branch and safety rules

- Develop only on the assigned `claude/*` branch. Never commit to or merge into `main`. Never force-push. Never delete remote branches.
- No production deploys, no production data, no real credentials. `.env` is git-ignored.
- Do not weaken tenancy or the session check to make a test pass. Do not delete a failing test; fix the code or the test's expectation with a documented reason.

## Conventions

- TypeScript strict, ESM, `type` imports. Dates are ISO `YYYY-MM-DD` business-date strings (location-local); the engine never touches `Date` objects.
- IDs: findings `F-###-XXX`, interventions `IV-##`, actions `A-##`, adjustments `ADJ-###`.
- Tests live next to the package in `test/` (Vitest). e2e in `/e2e` (Playwright).
- Keep `docs/DEMO_PLAN.md` status table current when a task lands.
