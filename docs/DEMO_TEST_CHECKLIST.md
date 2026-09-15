# Demo test checklist

Automated where marked (A); manual walkthrough where marked (M). Run `pnpm check && pnpm e2e` first.

## Financial integrity (A)

- [ ] Integer cents: every engine function rejects fractional cents (`money.test.ts`).
- [ ] Cross-class sum throws (`money.test.ts`).
- [ ] Mint unreachable except through `verificationService` (`mint.test.ts`): calling `mint` with a
      wrong token throws; a failed gate cannot mint; unconfirmed execution cannot mint.
- [ ] Detector estimate ≠ verified value for every verified intervention in the fixture (`history.test.ts`).
- [ ] Inconclusive when placebo fails, never a smaller number (`measure.test.ts`).
- [ ] Guardrail breach → guardrail_failure, no partial credit (`verify.test.ts`).
- [ ] Overlap: two claims on intersecting scope never sum above the true total; unresolved blocks
      both (`overlap.test.ts`).
- [ ] Reversal appends an adjustment; verified row unchanged; realized recomputed (`ledger.test.ts`).
- [ ] Only persistent value annualises; label is "run rate" (`ledger.test.ts`).
- [ ] Month = sum of days, never weekly × 4.33 (`ledger.test.ts`).
- [ ] Re-running verification is idempotent (`verify.test.ts`).
- [ ] Engine purity guard passes (`purity-guard.test.ts`).
- [ ] Fixture determinism: same seed → identical register hash (`fixture.test.ts`).
- [ ] Planted signals are found by the detectors, with the onset within a week of the plant
      (`detectors.test.ts`).

## Consistency across screens (A + M)

- [ ] (A) The recoverable figure for a finding is identical on Home, Today, Recovery, Finding detail,
      Actions (`consistency.test.ts` via API).
- [ ] (A) Persistent verified savings on Home equals the sum of the Proof ledger's persistent rows.
- [ ] (M) Change scope (all → one room) on every screen; totals shrink consistently; a group-scoped
      finding is not counted as a room.
- [ ] (M) No percentage without a denominator visible on hover or in the drawer.

## API and tenancy (A)

- [ ] Every route requires a session (401 otherwise).
- [ ] Org B's persona cannot read Org A's finding/change/action (404, not 403 — no existence leak).
- [ ] Decide/complete/advance are rejected for personas without the permission (403).
- [ ] Responses validate against contracts (schema parse in tests).
- [ ] Illegal state transitions rejected with reason (approved → verified; executed → verified).

## Surfaces (M unless noted) — normal, empty, loading, error, responsive

For each of Home, Today, Profit Recovery, Findings, Finding detail, Actions, Changes, Measurement
detail, ROI proof, Data quality:

- [ ] Normal: headline answers the screen's one question; numbers carry class labels.
- [ ] Empty: Harbor House org (no verified claims) shows an honest empty state, not zeros dressed as
      results (A: e2e `empty-state.spec.ts`).
- [ ] Loading: skeletons, no layout shift (A: e2e checks `aria-busy`).
- [ ] Error: API failure renders a retry panel, not a blank page (A: e2e with a forced 500 route).
- [ ] Responsive: 400px and 1280px, no horizontal page scroll; tables scroll inside their container
      (A: e2e mobile project screenshots).
- [ ] Copy: no "proven", "guaranteed", "certain"; "banked/realized/saved" only on realized rows (A: lint
      test over UI strings).

## The demo flow (A: `e2e/demo-flow.spec.ts`; M: rehearse)

1. Sign in as Owner → Home shows persistent verified savings with interval and multiple.
2. Today → guardrail card first; open it → measurement detail shows the breach.
3. Recovery → funnel counts match Findings/Changes list counts.
4. Findings → Oakland Tuesday dinner labour → detail shows chart, onset, recoverable, causes,
   recommendation, guardrails, confidence dimensions.
5. Accept → owner and due date → Actions shows the action; Changes shows the intervention with a
   frozen plan and MDE.
6. Complete with evidence → fidelity complete → window open; Home "tests running" increments.
7. Advance clock 4 weeks → window closes → outcome rendered with gates, interval, bookable bound.
8. Proof → new row in the ledger; realized accrual begins the day after eligibility; run rate and
   multiple update; proof packet opens.
9. Data → the stale reservations feed is listed with the dollars it blocks; ticket-time finding is
   "data insufficient" with the same reason.
10. Reset demo → everything returns to the seeded state.

## Known limitations to say out loud in a demo

- All data is synthetic (Rosewood Group). The environment bar says so.
- Connectors and write-back are interface-only.
- The P&L ledger side of the bridge is fixture data.
