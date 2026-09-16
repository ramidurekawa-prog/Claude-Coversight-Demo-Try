# Demo test checklist

Automated where marked (A); manual walkthrough where marked (M). Run `pnpm check` (typecheck, lint,
unit + API tests, build) and `pnpm e2e` (Playwright, desktop + iPhone 13, against a production build
and a freshly re-seeded API) before a rehearsal.

## Financial integrity (A)

- [x] Integer cents: `Money` rejects fractional cents; summing two classes throws (`packages/engine/test/money.test.ts`).
- [x] Mint unreachable except through `verificationService`: a forged token throws; a failed gate cannot mint;
      unconfirmed execution cannot mint (`verify.test.ts`).
- [x] "Could not tell" ≠ "did not work": an under-powered positive is *directional*; an MDE above the
      projection is *inconclusive*; a powered null is *no effect* (`verify.test.ts`).
- [x] Inconclusive when the placebo fails, never a smaller number (`measure.test.ts`).
- [x] Guardrail breach → guardrail failure, no partial credit (`verify.test.ts`).
- [x] Overlap: intersecting claims never sum above the true total; unresolved blocks both (`overlap.test.ts`).
- [x] Group-level claims apportioned across rooms by largest remainder — rooms add up to the group and no
      dollar appears twice (`ledger.test.ts`).
- [x] Persistence: decaying vs holding, half-life, checks (`persistence.test.ts`).
- [x] Engine purity guard: no clock, randomness, I/O or downstream import in `packages/engine/src` (`purity-guard.test.ts`).
- [x] Fixture determinism: same seed → identical register fingerprint, pinned to `FIXTURE.version`;
      advancing the clock never rewrites an earlier row (`packages/fixture/test/rosewood.test.ts`).
- [x] Planted signals are found with the onset dated near the plant; the comps DROP at Alameda and a
      group-wide mix move are NOT flagged (`rosewood.test.ts`).
- [x] Every intervention outcome is computed, never declared; the bookable figure is below the point and at
      or below the lower bound; adjustments derive from the interventions (`rosewood.test.ts`).
- [x] Copy discipline: no banned word in generated or declared copy (`rosewood.test.ts`).

## Persistence and the clock (A)

- [x] Seed round-trips the register through Postgres exactly (fingerprint equality); idempotent; tenants
      apart; personas verify (`packages/db/test/seed.test.ts`).
- [x] The nightly job on a freshly seeded database changes nothing (`seed.test.ts`).
- [x] Advancing the clock lands the next slice of register, closes IV-07's window, records a verdict, keeps
      every adjustment's identity, moves feeds with the clock while the stale one stays stale (`clock.test.ts`).

## API and tenancy (A — `apps/api/test/app.test.ts`)

- [x] Every route requires a session (401); sign-up is not mounted (404).
- [x] The same finding shows the same recoverable figure on Home, Today, Finding detail; Home, Recovery
      and Proof read the same persistent figure.
- [x] Harbor House's owner sees an empty org; Rosewood's records answer 404 (no existence leak).
- [x] A GM is scoped to their room (403 for another room and for the group view); per-room persistent
      figures add up to the group figure.
- [x] Finance may read but not decide (403); the owner tier is enforced for a GM.
- [x] Accept builds the frozen plan and the action; a second accept, a blocked finding and an unresolved
      overlap are refused (409); a rejection needs a code and a reason (400).
- [x] Completing an action needs evidence (400); it opens the window (measuring); a done action stays done (409).
- [x] The clock only moves forward, only for the owner or an admin; after the advance the new change and
      IV-07 both carry verdicts.
- [x] Every response parses against its contract after a JSON round-trip (`contracts-roundtrip.test.ts`).

## The demo flow (A: `e2e/demo-flow.spec.ts`, desktop and iPhone 13; M: rehearse with `pnpm demo`)

1. Sign in as Rose Jorge (owner) → Home leads with persistent verified savings and the value multiple on a
   fee prorated to the same period; "Needs you first" ranks by consequence of inaction; the environment
   bar says the data is synthetic; no banned word on the page.
2. Today → the guardrail failure (Alameda dinner cut) is the first card.
3. Profit Recovery → eight funnel stages, each in its own class, with the drop-off named.
4. Findings → the live Oakland dinner comps finding: plain sentence, the control chart with the onset day,
   exposure → recoverable, ranked causes, the remedy, guardrails, eight confidence dimensions.
5. Accept → the action and the change are created with a frozen plan ("Created A-07 and IV-11").
6. Actions → mark done with evidence → "Window open on IV-11"; Changes shows it measuring.
7. Advance the clock 42 days → the windows close (IV-07 and IV-11) and the verification service decides.
8. Measurement detail → treatment vs control, the estimate, gates, guardrails, the bookable lower bound
   or the honest reason there is none.
9. ROI proof → the savings ledger with the reversal beside the wins; the hero figure equals Home's.
10. Data → the reservations feed is stale and the ticket-time finding is blocked by it.
11. Tenancy → Harbor House is honestly empty and cannot see Rosewood; a GM cannot open another room's
    finding; nobody signed in is sent to the sign-in page.

## Surfaces (M) — normal, empty, error, responsive

For each of Home, Today, Profit Recovery, Findings, Finding detail, Actions, Changes, Change detail,
ROI proof, Proof packet, Data:

- [x] The headline answers the screen's one question; every number carries its class label (screenshot pass, 16 Sep).
- [x] Empty: sign in as Elena Marsh (Harbor House) — honest empty states, no zeros dressed as results (A: e2e tenancy test).
- [ ] Error: stop the API — every screen shows "The API is not reachable" with a retry, not a blank page.
- [x] Responsive: 390px and 1280px, no horizontal page scroll; tables scroll inside their container (A: e2e mobile project).
- [x] Scope: switch All rooms → one room on every screen; figures shrink consistently; the group-level
      purchasing claim shows a third at each room (A: API test on per-room apportionment; screens rendered per room).
- [x] Demo controls: advance the clock and reset from the business-date chip; both say what they did (A: e2e steps 7–8 and the per-project reset).

## Running it

- `pnpm demo` — production build of the web app, then the API (:3001) and the web app (:3000). Use this
  for presenting: the pages hydrate instantly and nothing recompiles mid-demo.
- `pnpm dev` — hot-reloading development servers. In some sandboxed environments the dev server's
  HMR websocket is blocked and client-side interactivity does not attach; use `pnpm demo` there.
- `pnpm db:reset` — delete the PGlite directory and re-seed. Or use "Reset the demo" in the product.

## Known limitations to say out loud in a demo

- All data is synthetic (Rosewood Group, Harbor House Group). The environment bar says so on every screen.
- Connectors and write-back are interface-only; the Toast ingestion port is scheduled, not shipped.
- The P&L ledger side of the bridge is fixture data standing in for the accounting feed.
- Historical findings (the nine that converted before the current contract) are records, not re-detections.
