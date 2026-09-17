# Demo plan — Streamline by Coversight

Living document. Status table at the bottom is updated as work lands.

## 1. Audit (15 September 2026)

### What the repository contained

Nothing. The GitHub repository `ramidurekawa-prog/Claude-Coversight-Demo-Try` had no commits, no branches
(`main` and `claude/demo-v1` do not exist), no code, no tests, no CI, no deployment configuration.
There was no frontend, backend, database, worker, analytics engine, integration, or authentication to
run, test, or lint. The audit of "what exists today" therefore reduces to: the specification and two
prototypes exist; the product does not.

Consequences:

- Every item in the founder's audit list (broken functionality, mocked data, numerical inconsistencies,
  duplicate counting, demo embarrassments) is assessed against the **prototypes and the specification**,
  and each one becomes a rule the new build enforces rather than a defect to patch.
- The instruction "work only on `claude/demo-v1`" cannot be followed literally because that branch does
  not exist; the harness assigns `claude/brave-heisenberg-wjx4u8`, and all work is pushed there.
  Nothing touches `main` (which also does not exist yet).

### What the specification says the product is

`SKC Full layout.html` (the spec) describes a closed-loop margin controller: detect a leak, make the
change, prove it worked against a control, keep it. Its load-bearing rules are extracted in
`docs/SPEC_NOTES.md`. The spec also audits an earlier codebase (not supplied) and lists the defects a
customer could catch on first open. Those defects are the anti-checklist for this build:

| Defect class in the spec's own audit | How this build prevents it |
| --- | --- |
| Home leads with exposure larger than the restaurant's profit | Home leads with **persistent verified savings** and the verified value multiple; exposure is demoted and never totalled across classes |
| A verified figure equal to the detector's estimate (the mint relabelled an estimate) | Verified value is the lower bound of a DiD/reconciliation interval computed by the engine; a test asserts estimate ≠ verified |
| Two screens disagree about the same number (each computes in the page) | One `ledger()` function, one metric registry, same scope everywhere; tests assert cross-screen equality |
| Verified + in-testing summed and shown as a projection | `Money` classes throw on cross-class addition |
| Hours counted as cash; gross shown as net; mix counted twice | Counting rules 1–13 implemented in the engine (see SPEC_NOTES) |
| "High confidence" badge with no basis | Eight-dimension confidence profile behind every word |
| "Proven" in the hero | Banned-word lint on product copy |
| Fake trend lines / annualised anything | Only persistent verified value annualises, labelled "run rate"; charts render real series from the register |
| Stale build serving errors | `pnpm check` = typecheck + lint + test + build; e2e walks the demo script |

### Prototypes

- `rosewood-margin-controller_2.html` — a single-file working prototype (Rosewood Group, three rooms,
  52 weeks, seeded). Its engine (EWMA/CUSUM detectors, DiD with placebo test, gates, mint, overlap
  precedence, persistence half-life, state machines) is faithful to the spec and is the reference for
  the engine port. Its UI is dense and analyst-first; its screens (17 across four personas) are more
  than a 15-minute demo needs. Presentation defects we do not copy: equal-weight KPI walls, jargon-first
  labels, several numbers computed in render functions, persona switcher that changes what is shown.
- The spec's Part I design review lists ~30 presentation notes; the ones that apply are in the test
  checklist.

## 2. Objective

A working demo a founder can put in front of restaurant owners and groups that makes them understand,
in 10–15 minutes, the story **DATA → FINDING → RECOMMENDATION → ACTION → EXECUTION → MEASUREMENT →
VERIFIED RESULT → ROI PROOF** — with numbers that are consistent on every screen, deterministic, and
explainable on demand.

Not the objective: enterprise integrations, real POS connectors, accounting write-back, autonomy above
A2, benchmark network, LLM features.

## 3. The demo script (target 12 minutes)

Persona: Rose Jorge, owner of Rosewood Group (three full-service rooms: Oakland, Berkeley, Alameda).
Synthetic data, labelled as such on every screen. Demo clock stands on **15 September 2026**.

| # | Screen | What the audience sees | Story beat |
| --- | --- | --- | --- |
| 1 | **Home** | One headline: persistent verified savings this period with its interval and the value multiple against the fee; beneath it the loop in priority order: decisions due, executions due, tests running, results landed, wins decaying; data confidence | "This is what we have actually proved, and what needs you this week." |
| 2 | **Today** | Work queue ranked by consequence of inaction: guardrail breach first, then data-quality failure, overlap conflict, high-value finding awaiting decision, window closing soon | "Fifteen minutes with a phone in one hand." |
| 3 | **Profit Recovery** | Funnel: detected → qualified → accepted → executed → measured → verified → persistent → reconciled with counts, dollars per class and the drop-off named; the twelve conversion metrics | "Where opportunities go, and why they die." |
| 4 | **Finding detail** (Oakland dinner comps, live since 10 Aug, 15 days left to decide) | Plain sentence, the control chart with the drift onset day, observed vs baseline, the dollar (exposure → recoverable), ranked causes, the recommendation with its drafted artifact, guardrails, the eight confidence dimensions, overlap status | DATA → FINDING → RECOMMENDATION |
| 5 | **Accept** | Accept with owner and date → the action and the intervention are created with a frozen measurement plan (primary metric, control set, MDE, guardrails, window) | ACTION |
| 6 | **Actions** | The action list; mark done with evidence → execution fidelity resolved → window opens. Also visible: the Tuesday labour cut at Oakland (IV-07) already executing, result due 6 Oct | EXECUTION |
| 7 | **Advance the demo clock** (labelled synthetic control) | The register extends to the window close with the change applied; checkpoints accumulate; the window closes; the verification service decides — for IV-07 and for the comps change just made | MEASUREMENT |
| 8 | **Intervention / measurement detail** | Treatment vs control series, DiD point estimate, standard error, interval, placebo test, MDE, every gate with its verdict, every guardrail, the bookable lower bound, the house sentence | VERIFIED RESULT |
| 9 | **ROI proof** | Savings ledger: every verified claim with treatment, control, interval, gates, persistence class; realized accrual by day/week/month; reversals shown, never netted; run rate; value multiple; the P&L bridge for one claim; proof packet export | ROI PROOF |
| 10 | **Data quality** | Feed freshness from delivered data, completeness, dollars at risk apportioned per feed, the one stale feed and what it blocks | "Can I trust these numbers?" |

Also shown along the way (already in the seeded history so the ledger is honest): a guardrail failure
(Alameda dinner labour cut that slowed service — rejected, reversal recommended), a no-measurable-effect
result (Alameda prep list), an inconclusive result, a reversed claim with a credit (Alameda comps
recode), a decaying win with an upkeep action (Oakland fry portion), a rejected finding with a reason
(seasonal salmon), and an overlap allocation (chicken price vs chicken portion).

## 4. Scope — eight surfaces, one primary question each

| Surface | Route | Primary question | Headline number (class) |
| --- | --- | --- | --- |
| Home | `/` | What have we proved, and what needs me this week? | Persistent verified savings (bookable) + value multiple |
| Today | `/today` | What do I do right now? | Count of cards; no dollar hero |
| Profit Recovery | `/recovery` | Where do opportunities go, and why do they die? | Funnel per stage, each in its own class |
| Finding detail | `/findings/[id]` | Why is money leaking here, and what should change? | Recoverable/week (estimated) |
| Actions | `/actions` | Did someone do the thing? | Overdue count |
| Measurement | `/changes/[id]` | Did the change work, and how much is ours? | Effect/week with interval (causal → bookable) |
| ROI proof | `/proof` | What have we actually proved, and what is it worth? | Realized to date (realized) + run rate |
| Data quality | `/data` | Can I trust these numbers? | Data confidence (composite, explained) |

Secondary: Findings list (`/findings`), Changes list (`/changes`), About/synthetic-data drawer, sign-in
persona picker (owner / GM / finance / admin) that changes navigation emphasis but never a number.

## 5. Demo data design (synthetic, deterministic)

Rosewood Group, seed `rosewood-v5` (FIXTURE.version 1.0.0, fingerprint pinned by test), 15 Sep 2025 →
14 Sep 2026 (52 weeks), two dayparts, 18 menu items, 12 SKUs, 7 roles, ~70k checks / 158k order lines /
22k shifts / 1.9k invoice lines → 2,186 services. Planted signals: chicken price step (vendor, 6 Jul),
portion drift at Berkeley (13 Jul, same SKU — the overlap), Tuesday overstaffing at Oakland (22 Jun,
converted to IV-07 on 1 Sep, executing since 8 Sep), comps excursion at Berkeley lunch (fixed in June)
and Oakland dinner (live since 10 Aug — the finding the demo accepts), comps recode at Alameda (the
reversal), mix drift at Alameda, ticket creep at Alameda (blocked by the stale reservations feed),
capacity constraint at Oakland Fri/Sat. Ten declared interventions with frozen plans; every outcome is
**computed** by running the register through the estimator and the verification service — none is
written down. Computed at 15 Sep: IV-01 and IV-02 verified and persistent, IV-09 verified with a
named limitation, IV-03 verified then decaying (upkeep action), IV-04 guardrail failure, IV-08 a
powered null, IV-05 and IV-06 inconclusive by design failure (MDE above the projection), IV-10
reversed, IV-07 measuring. Value multiple 3.2× on a prorated fee. The demo clock can advance; the
generator extends the register deterministically and applies the effect of executed changes so the
loop can close inside the demo.

Consistency guarantees: every KPI is computed once per (org, scope, asOf) by `engine/ledger` and served
through the API; the UI renders, it does not compute. Tests assert the same finding shows the same
recoverable figure on Home, Today, Profit Recovery, Finding detail, and Actions.

## 6. Acceptance criteria

1. `pnpm check` and `pnpm e2e` are green from a clean clone (`pnpm install && pnpm db:seed`).
2. The ten-step demo script above runs end to end in the browser without a manual data edit.
3. Every customer-facing dollar traces to an engine function with a test; no LLM in the path.
4. No cross-class sum anywhere; the test suite includes a cross-screen consistency test.
5. Every screen has a real empty state, loading state, and error state.
6. Tenant isolation: a second org is seeded; API tests prove org A cannot read org B's rows.
7. Responsive at 400px and 1280px for the eight surfaces (Playwright mobile project).
8. Docs current: this plan, ARCHITECTURE, TEST_CHECKLIST.

## 7. Status

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Audit spec + prototypes, map requirements | done | Repo empty; rules extracted to SPEC_NOTES |
| 2 | CLAUDE.md, DEMO_PLAN, ARCHITECTURE, TEST_CHECKLIST | done | living docs |
| 3 | Compare, select, port and integrate proven implementation from the reference monorepo | done | `docs/REFERENCE_COMPARISON.md`: Postgres-dialect Drizzle + PGlite, Fastify + better-auth, canonical Toast-shaped rows, design tokens. Toolchain: Next 16, TS 5.9, Vitest 4, Playwright 1.56.1 |
| 4 | Engine: money/claims, stats, charts + change-point, DiD/reconcile, gates, mint, overlap, state machines, detectors, rollup, pipeline, ledger, confidence, queue | done | 61 tests; purity enforced |
| 5 | Fixture: Rosewood canonical generator + declared history + build + Harbor House + personas | done | 23 tests; planted signals found; outcomes computed; fingerprint pinned |
| 6 | DB: Postgres-dialect schema on PGlite, migrations, org-first repos, seed, nightly job, demo clock | done | 5 tests incl. clock advance closing a window |
| 7 | API: Fastify routes + contracts + better-auth + location scope | done | 41 tests: tenancy, scope, decisions, execution, the full loop through a clock advance |
| 8 | UI: tokens/shell port, eight surfaces, states | done | All eleven routes render for owner, GM and the empty tenant; verified visually on desktop and iPhone 13 |
| 9 | Tests: unit, API, consistency, tenant, e2e demo flow, responsive | done | 63 engine, 23 fixture, 8 contracts, 10 db, 46 API, 5 web (copy, layering, host) tests; `pnpm e2e` runs the ten-step script on desktop and iPhone 13 — 18 passed against a production build and a freshly re-seeded API |
| 10 | Manual walkthrough + fixes + docs refresh | done | Every surface screenshot-reviewed on desktop and phone as owner, GM and the empty tenant; fixes landed (shell grid, decaying-claim confidence word, parked decisions) |
| 11 | Deployable from one Netlify site: API in-process, hosted Postgres | done | Host-detected, verified locally against a real Postgres: seed 7.5s, every surface 115–216ms |
| 12 | A broken deployment explains itself | done | `/api/v1/health` diagnoses the four stuck states and is served even when the boot fails; the boundary above the app shell, and sign-in, show its remedy instead of "a server error occurred". 12 new tests |
| 13 | The deployment sets itself up: build-step seed, host-provisioned database variables | done | `pnpm db:seed:deploy` migrates and seeds in the build (8.4s, idempotent); `NETLIFY_DATABASE_URL` is read; no terminal needed |
| 14 | Port the Toast ingestion + simulator from the reference (not needed for the demo) | later | |

## 8. Decisions taken without asking (and why)

- **Postgres dialect with PGlite as the zero-service default** (reversing the first scaffold's SQLite
  choice after the reference comparison): the reference's proven schema conventions carry over, a
  real Postgres is one environment variable away, and nothing external is needed for the demo.
- **Standalone Fastify API** (as the reference's ADR-0001) with the web app proxying `/api/*`: route
  tests inject against PGlite without HTTP, and the session cookie stays first-party.
- **Group-level claims apportioned equally across rooms** in per-room views, named in the metric
  contract, so per-room views add up to the group and no dollar is counted twice.
- **Decision window of 45 days opens at qualification**, not at the chart's first signal, so a slow
  weekly-evidence finding is not expired before it could have been decided.
- **"Nightly job" runs synchronously when the demo clock advances** instead of a scheduler: the demo
  needs the loop to close in minutes, and it keeps the engine's `asOf` discipline explicit.
- **Product name**: UI says "Streamline" with "by Coversight"; packages are `@streamline/*`.

## 9. How to run the demo

```
pnpm install
pnpm demo          # production build of the web app, then API :3001 and web :3000
```

Open http://localhost:3000, sign in as Rose Jorge (owner) with the published demo password, and follow
§3. The business-date chip in the top bar opens the demo controls (advance the clock, reset). Use
`pnpm dev` for development; present with `pnpm demo` (see docs/DEMO_TEST_CHECKLIST.md, "Running it").

## 10. Blockers

None. Nothing in the demo scope needs an external credential or service.
