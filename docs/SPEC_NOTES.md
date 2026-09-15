# Specification notes — the rules this build implements

Extracted from "SKC Full layout" (11 September 2026 edition). Section references are the spec's own.

## The loop (Doctrine 1) — fourteen stages

Detect → Diagnose → Prioritize → Propose → Approve → Execute → Confirm execution → Monitor → Measure →
Check guardrails → Verify → Book conservatively → Track persistence → Maintain/reverse/retire.
Stage 7 (execution evidence) is a hard precondition for 9–12.

## Claim classes (Doctrine 3 / System 4)

| Class | Strength | Aggregate | Headline | Billable |
| --- | --- | --- | --- | --- |
| profit_exposure | estimated | never totalled | no | no |
| identified_exposure | estimated | within one location | no | no |
| recoverable | estimated | deduplicated | with a range | no |
| projected | modelled | no | no | no |
| committed | modelled | within class | as in-flight | no |
| measured | causal | no | no | no |
| causal | causal | no | no | no |
| verified | bookable | yes | yes | no |
| bookable | bookable | yes | yes | yes |
| realized | bookable | yes | yes | yes |
| maintained | bookable | separately | labelled | by agreement |
| adjustment | bookable | separately | yes | no |

Reserved words (`banked`, `realized`, `recovered`, `saved`) belong to the bottom rows. Banned words:
`guaranteed`, `certain`, `proven`.

## Counting rules (System 5) — thirteen prohibitions

1. Opportunity never reported as savings. 2. Nothing annualised unless persistent; label "verified
annualised run rate". 3. Two interventions never claim one dollar (overlap engine). 4. Labour hours are
not cash — payroll cost must move. 5. Avoided cost ≠ reduced expense. 6. Revenue counts through
contribution margin. 7. Persistence status required on every claim surface. 8. No savings after a
guardrail failure; no partial credit. 9. Shrink needs counts or caps at measured. 10. Price, mix and
quantity decomposed before attribution; unexplained price effect excluded. 11. One canonical mix
decomposition per period per location. 12. Totals only on a common period. 13. Net is the default;
gross needs a label.

Overlap precedence: explicit human resolution → earliest verified → narrowest scope → strongest method
→ proportional → unresolved (blocks both).

## Measurement (Doctrine 5, System 11)

- Family A (directly observed cost: labour hours removed, overtime, invoice unit price, comps back to
  norm): reconciliation, with the concurrent index disclosed.
- Family B (revenue/demand: price, mix, tickets, turns): DiD against matched controls with a placebo
  parallel-trends check on two pre-periods.
- Family C (hybrid: staffing, portion, prep): both legs; net CM; every critical guardrail must pass.
- Plan frozen before execution: primary metric, secondary, guardrails with thresholds, unit of analysis,
  baseline window, measurement window, comparison population, expected latency, minimum observations,
  MDE, confounders, exclusions, attribution rung, confidence threshold, stop conditions, persistence
  schedule.
- Counterfactual rungs: 1 randomised, 2 matched controls, 3 DiD/ITS with control (bookable alone);
  4 synthetic control, 5 pre/post with covariates (bookable with limitation); 6 naive pre/post (never);
  7 correlation (context only).
- Ten outcomes: verified, verified_limited, directional, inconclusive, no_effect, negative,
  guardrail_failure, data_failure, attribution_conflict, reversed.

## The mint (Doctrine 8, G8)

`bookable = max(0, point − t(0.95, df)·SE − incremental_cost − unresolved_overlap)`, written only by the
verification decision service after every blocking gate passes: execution confirmed, minimum
observations, effect ≥ MDE, placebo passed, lower bound > 0, every guardrail observed and inside its
limit, data quality through the window, overlap resolved. Comparability (pre-period fit ≥ 0.55) is a
soft gate that downgrades to "verified with limitations".

## Guardrails (Doctrine 6)

Labour: net sales, covers, ticket time, rating, overtime elsewhere. Pricing: category units, covers,
check average, mix. Purchasing: quality complaints, stockouts, substitution. Throughput: ticket time,
rating, overtime. Portion/prep: rating, waste, stockouts, plate complaints. Comps: rating, refunds,
repeat visits. A breach rejects; a missing guardrail is a failure, not a pass. Tolerances used here:
net sales −3%, covers −4%, ticket time +1.5 min, rating −0.15, overtime +5%, comps +0.6pp, check average
−3%; a breach requires the optimistic end of the interval to be past the limit.

## Persistence (Doctrine 9, G12)

Exponential decay fit on the post-window weekly effect. Structural (interval includes zero): accrues 52
weeks then retires. Durable (half-life > 26 weeks): decayed accrual, quarterly re-verify. Upkeep
(half-life < 8 weeks): accrual falls automatically and a maintenance action surfaces.

## Ledger (Part III §6)

Day = Σ (weekly bookable ÷ 7) × persistence(t) over active verifications. Week = seven days plus any
window that closed. Month = sum of days. Reversal removes dollars retroactively via an appended
adjustment; the original row stays. Annual total reconciled against margin change and capped.

## Home (System 6) — fifteen KPIs that may never be added together

Total profit exposure · qualified recoverable · approved test value · active intervention value ·
measured improvement · pending verification · verified savings · persistent verified savings ·
reversed/expired · verified annualised run rate · verified value multiple · open findings · overdue
actions · data confidence · reconciliation status. Hero = persistent verified savings with the multiple.

Metric contract (ten attributes on every number): definition, date range, location scope, status,
confidence profile, freshness, lineage, drill-down, explanation of change, calculation version.

## Today (System 7) — eleven card types, one action each, ranked by consequence of inaction

guardrail (1) · data quality (2) · overlap (2) · verification exception / reversal (3) · missing
evidence (4) · action due (5) · high-value finding (6) · window eligible (7) · persistence (8) ·
reconciliation question (9). An empty Today is a valid state.

## Findings (System 8) — eleven states

detected · investigating · data_insufficient† · qualified · awaiting_decision · accepted · rejected† ·
superseded† · converted · expired† · invalidated† († terminal, reason required).

## Interventions (System 9) — eighteen states, two forbidden edges

draft → awaiting_approval → approved → scheduled → in_progress → evidence_pending → executed →
measurement_pending → measuring → {verified | inconclusive | failed | guardrail_failed} → verified →
persistence_monitoring → persistent → closed; decayed, reversed. Forbidden: approved → verified;
executed → verified.

## Confidence (System 14) — eight dimensions

data sufficiency · measurement quality · attribution strength · execution certainty · comparability ·
guardrail completeness · persistence evidence · reconciliation status. Six words: Estimated,
Directional, Measured, Verified, Persistent, Reconciled — always expandable to the eight.

## Operator copy (Doctrine 10) — house sentences

Proposed: "Tuesday dinner is carrying about 18 paid hours the room did not need. Could save
approximately $392 a week. We would watch sales, ticket times and guest ratings for four Tuesdays."
Monitoring: "Executed 8 September — 18 hours came out, as planned. 2 of 4 comparable services
observed. Guardrails healthy. Result on 6 October." Verified: "Labour cost fell $392 a week. Comparable
Tuesdays indicate at least $318 a week is attributable to the change. … Verified, holding, billable at
$318." Inconclusive / Rejected / Decaying / Blocked have their own sentences. Silence is a feature.

## Design (Part III P4)

One system; colour means one thing (status for claim strength and workflow state; a separate
categorical ramp for identity; one sequential ramp for magnitude); one number per screen; density
suited to the reader; keyboard-complete; AA contrast; phone-first for Today.

## AI boundary (Part I §9, Part III P6)

Language models translate, extract, narrate and answer questions over stored facts. They never touch
a number the customer is shown. This demo makes no model calls.
