# Reference comparison — what to port, what to leave

Source: `streamlinekitchenco-platform-monorepo-main` (the SKC monorepo, last commit 26 Aug 2026 —
the codebase the specification audits). Reference code only: it is never modified, pushed to, or
merged. Everything below is a decision about what THIS repository adopts.

## 1. Architecture verdict

| Dimension | Greenfield scaffold (before) | Reference | Decision |
| --- | --- | --- | --- |
| Database | SQLite file via better-sqlite3 + drizzle | Postgres 18 via drizzle (pg), **PGlite (in-process WASM Postgres) for tests**, docker compose for a real server | **Adopt Postgres dialect. PGlite file-backed is the zero-service default for dev and the demo; `DATABASE_URL` switches to real Postgres with no code change.** Verified in this sandbox on Node 22: cold boot 4 s, warm 0.3 s, persists across runs. |
| API | Next.js route handlers | Fastify 5 + `fastify-type-provider-zod`, tests via `app.inject` on PGlite | **Adopt Fastify as a standalone `apps/api`** (reference ADR-0001). The web app proxies `/api/*` to it server-side so the session cookie stays first-party. Route tests inject against PGlite, no HTTP. |
| Auth | Planned signed persona cookie | better-auth (email+password, argon2id, invite-only, sessions in Postgres), owner/gm memberships, GM location scopes, `skc_admins` | **Adopt better-auth as-is**, with scrypt in place of argon2id: argon2's native loader cannot be bundled into a serverless function, and the demo has to deploy to one (see `docs/ARCHITECTURE.md`, "Deployment shapes"). Demo users are seeded with known passwords and the sign-in page offers persona buttons; tenancy stays in the repository layer. |
| Tenancy | orgId-first repositories | Same pattern, proven by tests; `resolveLocationScope` (404 unknown, 403 outside scope) | **Port as-is.** |
| Contracts | Zod per route | Zod per route family + thin client that parses responses (`ApiRequestError` / `ContractViolationError`) | **Port the pattern and client; rewrite the schemas** for the new surfaces. |
| Jobs | Synchronous "nightly" on clock advance | pg-boss worker (nightly detection, weekly reverification, Toast sync) | **Port job functions as plain functions**; the demo clock calls them synchronously. A pg-boss worker entrypoint remains for real Postgres deployments. |
| Engine | Port of the spec-aligned prototype (control charts, DiD + placebo, ten outcomes, lower-bound mint, 18-state interventions, overlap engine, persistence, ledger) | Formula wrappers over hand-supplied inputs; four "gates" (magnitude/confidence/counter-metric/window); `closeWindow` books the **detector's estimate** as the verified value; ROI applies confidence multipliers and ×4.33 | **Keep the spec-aligned engine. Do not port the reference gates, mint, ROI multipliers or ranking multipliers** — the specification names each as a defect (relabelled estimate, hours-as-cash, ×4.33 months, unfounded constants). Port from the reference: branded `Cents<K>` idea (merged into `Money`), the ESLint-backed purity guard test, `dedupeKeyOf`/`stableScope`, largest-remainder `apportion`, contribution-margin and mix-shift arithmetic. |
| Data model | Service-grain register | Canonical Toast-shaped rows (checks, order_items, shifts, table_sessions, reviews, recipe_costs, menu_items), raw events, ingest cursors, materialised rollups with an engine-version registry, append-only timeline, seed_state | **Adopt the canonical schema and conventions** (uuid v7, org_id everywhere, integer cents, rollups stamped with engine version) and **add** invoices/SKUs, reservations, and the spec's finding / action / intervention / verification / adjustment records. The engine reads service-grain rollups materialised from canonical rows. |
| Fixture | 52-week seeded generator (prototype port), signals planted in data | 13 weeks, three rooms, 15 items; detector inputs are literal constants in `candidates.ts` (not derived from rows); content hash + version discipline; golden manifest tests | **Keep the generator; port the discipline** (version + content hash test, golden manifest, uuid v5 ids from labels). The reference dataset is not reused: too short for control charts and its findings are not computed from data. |
| Toast ingestion + simulator | none | Real: canonicalize, idempotent ingest with cursors/backfill/late edits, webhook signatures, simulator with scenarios and pagination | **Port after the demo surfaces are working** (milestone 7). The canonical schema is adopted now so nothing blocks it. |
| Web | Next 16 App Router scaffold | Next 16, server components calling the API through a server-side proxy, shell (sidebar/topbar/location switcher/theme), per-screen CSS + tokens, testing-library page tests | **Port the shell, proxy, server-api, theme and token architecture; rewrite the screens** to the eight new surfaces and the new design direction. Reference screens lead with exposure and compute in the page — not reused. |
| Design system | none | `init-resources/skc-design-system` (tokens, kit.css, components, JSX mockups), `packages/ui` (badge, button, card, stat-card, skeleton, empty-state, input) | **Port tokens and primitives with changes** (status colour reserved for claim strength / workflow state). The attached `index.html` design reference loads `shared/styles.css` and `shared/loader.js`, which were not supplied; its visible intent (owner view, doctrine bar "only Verified Savings count toward ROI", "How values are classified" drawer) is honoured. |
| CI / deploy | none | GitHub Actions (PGlite suite + Postgres 18 job), Render blueprint | **Port CI**; deployment config is out of demo scope. |

## 2. Why not keep the SQLite scaffold

It worked, but it was the weaker choice once the reference existed: the reference's migrations, test
helpers, repository tests, auth and API tests all assume Postgres semantics (jsonb, enums, `returning`,
`ON CONFLICT`), and PGlite removes the only reason SQLite was chosen (no external service). One
dialect from laptop to production, and the reference's proven pieces port without translation.

## 3. Reference defects that must not be reproduced (from its own code and the spec's audit)

- `lifecycle.closeWindow` writes `weeklyValueCents = action.weeklyImpactEstCents` — the estimate
  relabelled as verified. Our mint takes a measured effect and books the lower bound.
- `worker.ts` runs reverification with `observationsFor: () => []` — the sweep can never reverse.
  Our nightly job derives guardrail observations from rollups.
- Detector inputs are hand-typed constants (`candidates.ts`); findings are not computed from rows.
- ROI: `vmo = vwk × 4.33`, confidence multipliers on dollars, "potential" mixes verified with
  in-testing. Spec: month = sum of days; no multiplier; classes never mix.
- Staffing rests on a cover cap of 14 (unmeasured); overtime once charged the full 1.5× hour.
- Home leads with exposure and a "savings source" split of exposure; six equal KPI cards.
- Six-state action machine cannot express execution evidence, inconclusive, or decay.

## 4. What is ported, file by file

| Into | From (reference) | Changes |
| --- | --- | --- |
| `packages/db/src/schema.ts` | `packages/db/src/schema.ts` | Keep identity/auth/tenancy/canonical/raw/rollup/timeline/seed tables and conventions; replace findings/actions/windows/guardrails/verifications with the spec records; add skus, invoice_lines, reservations, service/item/labour/invoice rollups, interventions, verifications (ten outcomes), adjustments, demo clock on orgs |
| `packages/db/src/repositories.ts`, `identity.ts`, `test-helpers.ts`, `seed.ts` (shape) | same names | Extended for the new tables; `freshDb()` unchanged (PGlite default, `TEST_DATABASE_URL` for real Postgres) |
| `packages/contracts/src/client.ts`, `error.ts`, `me.ts` | same | New route families |
| `apps/api/src/app.ts` (skeleton), `auth/*`, `location-scope.ts`, `email/*`, `test-helpers.ts` | same | Domain routes rewritten for Home/Today/Recovery/Findings/Actions/Changes/Proof/Data/Demo |
| `apps/web/lib/api-proxy.ts`, `server-api.ts`, `components/shell/*`, `theme-script.tsx`, `app/globals.css` tokens | same | New navigation, new screens |
| `packages/ui/*` | `packages/ui/src/*` | Colour semantics changed to claim-class/status; new chart primitives |
| `packages/engine/test/purity-guard.test.ts` | `packages/engine/src/purity-guard.test.ts` | Same mechanism, our rules |
| `.github/workflows/ci.yml` | same | pnpm/Node 22, no Render |
| `packages/integrations`, `apps/toast-sim` | same | Milestone 7 (after demo surfaces) |

## 5. What is deliberately left behind

`packages/engine/src/verification/gates.ts`, `roi/*`, `ranking/multipliers.ts`, `detectors/*` (formula
wrappers), `metrics/heatmap-benches.ts`, `metrics/staffing.ts` (cover cap), `metrics/today-forecast.ts`,
`db/src/rosewood/*` dataset, the reference web screens, `render.yaml`, Resend mailer wiring (kept as a
logging mailer), `menu-quadrant`/`simulations` metrics (not in demo scope).
