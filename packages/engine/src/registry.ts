/**
 * Registries and vocabularies: equations (System 13), units, the metric contract
 * (System 6), confidence dimensions (System 14), the counterfactual hierarchy
 * (System 11), verification outcomes, reconciliation statuses, autonomy, and
 * the evidence ladder. A number whose equation is not registered does not render.
 */

export const UNITS = [
  "cents",
  "cents_per_cover",
  "cents_per_week",
  "cents_per_hour",
  "hours",
  "covers",
  "units",
  "ratio",
  "pct_points",
  "minutes",
  "days",
  "count",
  "rating_points",
  "cents_per_unit",
] as const;
export type Unit = (typeof UNITS)[number];

export function dimCheck(unit: string): Unit {
  if (!(UNITS as readonly string[]).includes(unit)) throw new Error(`unknown unit ${unit}`);
  return unit as Unit;
}

export type EquationStatus = "sound" | "flawed" | "unfounded";
export type ClaimCeiling = "estimated" | "modelled" | "measured" | "causal" | "bookable" | "realized";

export interface Equation {
  id: string;
  family: string;
  name: string;
  formula: string;
  inputs: string[];
  unit: Unit;
  status: EquationStatus;
  ceiling: ClaimCeiling;
  surfaces: string[];
  note?: string;
}

const EQUATIONS: Equation[] = [
  { id: "A1", family: "Revenue", name: "Net sales per service", formula: "Σ(check_total − comps − voids − discounts)", inputs: ["orders"], unit: "cents", status: "sound", ceiling: "measured", surfaces: ["Home", "Today"] },
  { id: "A3", family: "Revenue", name: "Covers per service", formula: "Σ guest_count over the daypart", inputs: ["orders"], unit: "covers", status: "sound", ceiling: "measured", surfaces: ["Home", "Finding"] },
  { id: "A5", family: "Revenue", name: "Comps & voids rate", formula: "(comps + voids) ÷ gross sales", inputs: ["orders"], unit: "ratio", status: "sound", ceiling: "measured", surfaces: ["Finding"] },
  { id: "B2", family: "Menu", name: "Item contribution margin", formula: "price − recipe_cost(effective_date)", inputs: ["menu", "recipes"], unit: "cents_per_unit", status: "sound", ceiling: "measured", surfaces: ["Finding"] },
  { id: "B4", family: "Menu", name: "Weighted CM per cover", formula: "Σ(units_i × cm_i) ÷ covers", inputs: ["menu", "orders"], unit: "cents_per_cover", status: "sound", ceiling: "measured", surfaces: ["Finding", "Measurement"] },
  { id: "B6", family: "Menu", name: "Own-price elasticity", formula: "OLS of ln(units per cover) on ln(price) across the item's own price history", inputs: ["menu", "orders"], unit: "ratio", status: "sound", ceiling: "causal", surfaces: ["Finding"], note: "Refuses when distinct prices < 3 or SE(ε) > |ε|/2" },
  { id: "B7", family: "Menu", name: "Contribution-maximising price", formula: "p* = c·ε/(1+ε) for ε < −1; undefined otherwise", inputs: ["B2", "B6"], unit: "cents_per_unit", status: "sound", ceiling: "modelled", surfaces: ["Finding"], note: "Returns 'too inelastic to price from data' for ε ≥ −1; the recommended step is bounded at +8%" },
  { id: "B9", family: "Menu", name: "Mix-shift decomposition", formula: "ΔCM = Σ(Δshare_i × cm_i⁰) + Σ(share_i¹ × Δcm_i) + Σ(Δshare_i × Δcm_i)", inputs: ["menu", "orders"], unit: "cents", status: "sound", ceiling: "measured", surfaces: ["Finding"], note: "One canonical decomposition per period per location (counting rule 11)" },
  { id: "C1", family: "Labour", name: "Measured service rate", formula: "1 ÷ slope of server-hours on covers across comparable services, above the floor", inputs: ["shifts", "orders"], unit: "covers", status: "sound", ceiling: "measured", surfaces: ["Finding"], note: "Declines to estimate when the slope is not identified to ±8%" },
  { id: "C2", family: "Labour", name: "Square-root staffing requirement", formula: "n* = ⌈λ/μ + z·√(λ/μ)⌉ with z from the service-level target", inputs: ["C1", "A3"], unit: "hours", status: "sound", ceiling: "modelled", surfaces: ["Finding"], note: "No cell sits inside its own benchmark" },
  { id: "C4", family: "Labour", name: "Paid labour cost per service", formula: "Σ(clocked_hours × loaded_rate) from time entries, not schedule", inputs: ["shifts"], unit: "cents", status: "sound", ceiling: "measured", surfaces: ["Finding", "Measurement"], note: "Counting rule 4: hours are a leading indicator, the payroll movement is the claim" },
  { id: "C6", family: "Labour", name: "Excess paid hours", formula: "max(0, clocked_hours − n*·service_length) per service", inputs: ["C2", "C4"], unit: "hours", status: "sound", ceiling: "estimated", surfaces: ["Finding"] },
  { id: "D1", family: "Throughput", name: "Capacity-constrained share", formula: "intervals where seated ≥ 0.92·capacity AND a wait was quoted ÷ all intervals", inputs: ["orders", "reservations"], unit: "ratio", status: "sound", ceiling: "measured", surfaces: ["Finding"] },
  { id: "D3", family: "Throughput", name: "Value of a faster turn", formula: "Δturns × constrained_share × CM_per_cover × party_size", inputs: ["D1", "B4"], unit: "cents", status: "sound", ceiling: "modelled", surfaces: ["Finding"], note: "Honest zero when constrained share is ~0 — unmet demand must be observed" },
  { id: "E2", family: "Detectors", name: "EWMA drift detector", formula: "z_t = λx_t + (1−λ)z_{t−1}; signal when |z−μ| > Lσ√(λ/(2−λ)(1−(1−λ)^{2t}))", inputs: ["any series"], unit: "ratio", status: "sound", ceiling: "estimated", surfaces: ["Finding"], note: "λ=0.25, L=3.0 → in-control ARL ≈ 500 observations" },
  { id: "E3", family: "Detectors", name: "CUSUM onset", formula: "S⁺_t = max(0, S⁺_{t−1} + x_t − k); onset = last t where S⁺ = 0", inputs: ["any series"], unit: "days", status: "sound", ceiling: "estimated", surfaces: ["Finding"], note: "Names the day a drift started, not the day it crossed" },
  { id: "E5", family: "Detectors", name: "Purchase price variance", formula: "price leg (p₁ − p₀) × q₁; mix leg (q₁ − q₀) × p₀", inputs: ["invoices"], unit: "cents", status: "sound", ceiling: "measured", surfaces: ["Finding"], note: "Counting rule 10: legs decompose exactly; an unexplained price effect is excluded, not absorbed" },
  { id: "E6", family: "Detectors", name: "Theoretical vs actual usage", formula: "(actual_qty − Σ(units_sold × spec_qty)) × unit_cost", inputs: ["invoices", "recipes", "orders"], unit: "cents", status: "sound", ceiling: "measured", surfaces: ["Finding"] },
  { id: "F2", family: "Ranking", name: "Expected value per hour of effort", formula: "(recoverable × P(verify | lever) × persistence_factor) ÷ operator_hours", inputs: ["recoverable", "priors"], unit: "cents_per_hour", status: "flawed", ceiling: "modelled", surfaces: ["Recovery"], note: "P(verify) is a portfolio prior until an outcome corpus exists, and is labelled as such" },
  { id: "G1", family: "Verification", name: "Difference-in-differences", formula: "(ȲT,post − ȲT,pre) − (ȲC,post − ȲC,pre)", inputs: ["treatment", "control"], unit: "cents", status: "sound", ceiling: "causal", surfaces: ["Measurement", "Proof"] },
  { id: "G2", family: "Verification", name: "Standard error of the DiD", formula: "√(s²T,post/nT,post + s²T,pre/nT,pre + s²C,post/nC,post + s²C,pre/nC,pre)", inputs: ["G1"], unit: "cents", status: "sound", ceiling: "causal", surfaces: ["Measurement"] },
  { id: "G3", family: "Verification", name: "Parallel-trends check", formula: "placebo DiD on the two pre-periods; fail if |t| > t₀.₉₇₅", inputs: ["treatment", "control"], unit: "ratio", status: "sound", ceiling: "causal", surfaces: ["Measurement"], note: "A failed control produces INCONCLUSIVE, never a smaller number" },
  { id: "G5", family: "Verification", name: "Minimum detectable effect", formula: "MDE = (z₁₋α/₂ + z₁₋β)·SE_planned from pre-period variance", inputs: ["G2"], unit: "cents", status: "sound", ceiling: "causal", surfaces: ["Measurement", "Finding"] },
  { id: "G8", family: "Verification", name: "Conservative bookable bound", formula: "max(0, point − t₀.₉₅,df·SE − incremental_cost − unresolved_overlap)", inputs: ["G1", "G2"], unit: "cents", status: "sound", ceiling: "bookable", surfaces: ["Measurement", "Proof"], note: "THE MINT. Writable only by the verification decision service." },
  { id: "G10", family: "Verification", name: "Portion variance without weekly counts", formula: "invoice usage over a reorder cycle vs theoretical from sales", inputs: ["invoices", "recipes"], unit: "cents", status: "sound", ceiling: "causal", surfaces: ["Finding"] },
  { id: "G12", family: "Verification", name: "Persistence half-life", formula: "exponential decay fit on the post-window outcome series; t½ = ln2 ÷ |decay|", inputs: ["outcomes"], unit: "days", status: "sound", ceiling: "bookable", surfaces: ["Proof"], note: "Structural if the decay interval includes zero" },
  { id: "H2", family: "ROI", name: "Realized savings accrual", formula: "Σ_days (bookable_per_week ÷ 7) × persistence(t)", inputs: ["G8", "G12"], unit: "cents", status: "sound", ceiling: "realized", surfaces: ["Proof", "Home"] },
  { id: "H4", family: "ROI", name: "Verified annualised run rate", formula: "persistent weekly bookable × 52, decayed by class", inputs: ["H2"], unit: "cents", status: "sound", ceiling: "bookable", surfaces: ["Proof"], note: "A run rate, not realised annual savings. The label is part of the metric." },
  { id: "H6", family: "ROI", name: "Verified value multiple", formula: "persistent verified (period) ÷ recurring fees (same period)", inputs: ["H2"], unit: "ratio", status: "sound", ceiling: "bookable", surfaces: ["Proof", "Home"] },
  { id: "I1", family: "Data quality", name: "Source freshness", formula: "asOf − max(business_date) delivered by the source, per feed", inputs: ["feeds"], unit: "days", status: "sound", ceiling: "estimated", surfaces: ["Data"], note: "Derived from delivered data, never from a stored health flag" },
  { id: "I3", family: "Data quality", name: "Dollars at risk per feed", formula: "Σ over open claims of (claim × share of cited sources this feed supplies)", inputs: ["I1", "findings"], unit: "cents", status: "sound", ceiling: "estimated", surfaces: ["Data"], note: "Apportioned across cited feeds, never repeated per feed" },
];

export const EQ: Readonly<Record<string, Equation>> = Object.freeze(
  Object.fromEntries(
    EQUATIONS.map((e) => {
      dimCheck(e.unit);
      return [e.id, e];
    }),
  ),
);

export function equation(id: string): Equation {
  const e = EQ[id];
  if (!e) throw new Error(`equation ${id} is not registered — a number without an equation does not render`);
  return e;
}

/* ---------- metric contract (System 6): ten attributes ------------------- */

export const METRIC_ATTRS = [
  "definition",
  "dateRange",
  "locationScope",
  "status",
  "confidence",
  "freshness",
  "lineage",
  "drillTo",
  "changeExplanation",
  "calcVersion",
] as const;
export type MetricAttr = (typeof METRIC_ATTRS)[number];
export type MetricContract = Record<MetricAttr, string>;

export function assertMetricContract(id: string, spec: Partial<MetricContract>): MetricContract {
  for (const a of METRIC_ATTRS) {
    if (spec[a] === undefined || spec[a] === "") throw new Error(`METRIC CONTRACT: "${id}" is missing ${a} — refusing to render`);
  }
  return spec as MetricContract;
}

export const CALC_VERSION = "equations v1.0 · policy v1.0 · ranking policy v1.0";

/* ---------- confidence (System 14) --------------------------------------- */

export type ConfidenceDimensionKey =
  | "data"
  | "measurement"
  | "attribution"
  | "execution"
  | "comparability"
  | "guardrail"
  | "persistence"
  | "reconciliation";

export interface ConfidenceDimensionSpec {
  key: ConfidenceDimensionKey;
  label: string;
  question: string;
  blocks: string;
}

export const CONF_DIMS: ConfidenceDimensionSpec[] = [
  { key: "data", label: "Data sufficiency", question: "Are there enough records, of good enough quality, at the right grain?", blocks: "Blocks qualification below threshold" },
  { key: "measurement", label: "Measurement quality", question: "Was the window long enough and the design adequate?", blocks: "Caps the claim at inconclusive" },
  { key: "attribution", label: "Attribution strength", question: "Which rung of the counterfactual hierarchy was used?", blocks: "Caps the claim class" },
  { key: "execution", label: "Execution certainty", question: "Do we know the change actually happened, and fully?", blocks: "Blocks verification entirely" },
  { key: "comparability", label: "Comparability", question: "Are the controls actually comparable to the treated unit?", blocks: "Downgrades to verified with limitations" },
  { key: "guardrail", label: "Guardrail completeness", question: "Were the right guardrails defined and observed?", blocks: "A missing guardrail is a failure, not a pass" },
  { key: "persistence", label: "Persistence evidence", question: "How long has this held, and through how many checks?", blocks: "Governs annualisation eligibility" },
  { key: "reconciliation", label: "Reconciliation status", question: "Do the books agree?", blocks: "Governs fee eligibility" },
];

export const CONF_WORDS = ["Estimated", "Directional", "Measured", "Verified", "Persistent", "Reconciled"] as const;
export type ConfWord = (typeof CONF_WORDS)[number];

/* ---------- counterfactual hierarchy (System 11) ------------------------- */

export interface Rung {
  n: number;
  label: string;
  bookable: "alone" | "limited" | "never";
  note: string;
}
export const RUNGS: Rung[] = [
  { n: 1, label: "Randomised assignment", bookable: "alone", note: "Units randomised to treatment and control." },
  { n: 2, label: "Matched control units", bookable: "alone", note: "Comparable services / items / locations, pre-period fit tested." },
  { n: 3, label: "Interrupted time series with control", bookable: "alone", note: "Own history plus a concurrent control series." },
  { n: 4, label: "Synthetic control", bookable: "limited", note: "Weighted composite; supports a claim with a named limitation." },
  { n: 5, label: "Pre/post with covariate adjustment", bookable: "limited", note: "Seasonality, weekday and events adjusted; limitation attached." },
  { n: 6, label: "Naive pre/post", bookable: "never", note: "Never supports a fee." },
  { n: 7, label: "Correlational association", bookable: "never", note: "Displayed for context and labelled correlation." },
];

export const CONFOUNDERS = [
  "Seasonality",
  "Day of week",
  "Holidays",
  "Weather where material",
  "Promotions",
  "Price changes",
  "Menu changes",
  "Store closures",
  "Staffing disruption",
  "Local events",
  "Delivery-channel mix changes",
  "Operating-hour changes",
  "Construction and access",
  "Equipment outages",
  "Supplier changes",
  "Manager changes",
  "Measurement contamination",
  "Other simultaneous interventions",
] as const;

/* ---------- ten verification outcomes ------------------------------------ */

export type VerificationOutcome =
  | "verified"
  | "verified_limited"
  | "directional"
  | "inconclusive"
  | "no_effect"
  | "negative"
  | "guardrail_failure"
  | "data_failure"
  | "attribution_conflict"
  | "reversed"
  | "pending";

export interface OutcomeSpec {
  label: string;
  meaning: string;
  consequence: string;
  claim: boolean;
}

export const VERIFICATION_OUTCOMES: Record<VerificationOutcome, OutcomeSpec> = {
  verified: { label: "Verified", meaning: "Every gate passed; a conservative bookable claim exists.", consequence: "Bookable claim, provenance complete.", claim: true },
  verified_limited: { label: "Verified with limitations", meaning: "Gates passed with a named caveat — shorter window, weaker control, partial scope.", consequence: "Bookable, with the limitation attached and visible on every surface.", claim: true },
  directional: { label: "Directionally positive", meaning: "The effect points the right way and does not clear the confidence bar.", consequence: "No claim. Feeds the prior for this lever.", claim: false },
  inconclusive: { label: "Inconclusive", meaning: "The design could not answer the question — power, controls or trends failed.", consequence: "No claim. A design failure, not an intervention failure.", claim: false },
  no_effect: { label: "No measurable effect", meaning: "The intervention executed and the outcome did not move.", consequence: "No claim. The single most valuable record type for learning.", claim: false },
  negative: { label: "Negative effect", meaning: "The outcome moved the wrong way.", consequence: "No claim, plus a reversal recommendation.", claim: false },
  guardrail_failure: { label: "Guardrail failure", meaning: "Primary effect real; a guardrail breached.", consequence: "No claim, escalation, reversal plan required.", claim: false },
  data_failure: { label: "Data failure", meaning: "Source completeness or integrity fell below policy during the window.", consequence: "Claim quarantined; remeasure after remediation.", claim: false },
  attribution_conflict: { label: "Attribution conflict", meaning: "Another intervention or an external event plausibly explains the change.", consequence: "No claim until resolved; may re-measure with a longer window.", claim: false },
  reversed: { label: "Reversed", meaning: "A previously verified claim is withdrawn.", consequence: "Negative adjustment plus a credit where a fee was charged.", claim: false },
  pending: { label: "Measuring", meaning: "The window is open.", consequence: "Nothing is counted while work is in flight.", claim: false },
};

/* ---------- reconciliation statuses (System 12) -------------------------- */

export type ReconStatus = "not_eligible" | "awaiting_close" | "partial" | "reconciled" | "timing" | "mapping" | "unexplained" | "not_in_gl";
export const RECON_STATUS: Record<ReconStatus, { label: string; note: string }> = {
  not_eligible: { label: "Not yet eligible", note: "The window has closed but the accounting period has not." },
  awaiting_close: { label: "Awaiting accounting period close", note: "Waiting on the customer's close calendar." },
  partial: { label: "Partially reconciled", note: "Part of the claim is supported; the remainder is still open." },
  reconciled: { label: "Reconciled", note: "The bridge is agreed and signed off." },
  timing: { label: "Timing difference", note: "Real, and it lands in a different period. Explained, not disputed." },
  mapping: { label: "Mapping exception", note: "The account or dimension mapping is wrong or missing." },
  unexplained: { label: "Unexplained variance", note: "The books and the claim disagree and nobody can say why. Blocks the fee." },
  not_in_gl: { label: "Not expected to appear directly in the GL", note: "Avoided cost, or a benefit that nets against an unrelated movement." },
};

/* ---------- autonomy ladder ---------------------------------------------- */

export type AutonomyLevel = "A0" | "A1" | "A2" | "A3" | "A4";
export const AUTONOMY: Array<{ level: AutonomyLevel; label: string; does: string; earned: string }> = [
  { level: "A0", label: "Observes", does: "Measures and reports. Nothing is recommended.", earned: "Nothing. Where every new location starts, and where a lever returns after a reversal." },
  { level: "A1", label: "Recommends", does: "Names the change, what it is worth, the confidence, and the counter-metrics that would kill it.", earned: "A measured basis for the figure." },
  { level: "A2", label: "Drafts", does: "Prepares the actual artefact and waits for one approval.", earned: "Write access to the register, plus a preview showing precisely what will change." },
  { level: "A3", label: "Executes within a fence", does: "Applies pre-authorised classes of change inside operator-set limits.", earned: "A verified track record for that lever at that location, an explicit fence, and a tested revert." },
  { level: "A4", label: "Holds the line", does: "Maintains a standard continuously and reports by exception.", earned: "Persistence data showing the standard holds, and a full quarter at A3 without an un-caught reversal." },
];

/* ---------- lever metadata ----------------------------------------------- */

export type Lever = "labour_hours" | "purchasing" | "portion" | "comps" | "menu_price" | "mix_shift" | "ticket_time";
export type MeasurementFamily = "A" | "B" | "C";

export interface LeverMeta {
  label: string;
  family: MeasurementFamily;
  domain: string;
  /** Share of exposure that is structurally recoverable (portfolio convention, labelled as such). */
  recoveryFactor: number;
  /** Portfolio prior until the outcome corpus exists (labelled as a prior). */
  prior: { pVerify: number; medianDaysToVerify: number; halfLifeWeeks: number };
  /** Doctrine 5: whether the lever may ever bill. */
  billable: "yes" | "lower_bound" | "never" | "where_unmet_demand" | "with_error_bar";
  guardrails: string[];
}

export const LEVERS: Record<Lever, LeverMeta> = {
  labour_hours: { label: "Labour hours", family: "C", domain: "Labour", recoveryFactor: 0.78, prior: { pVerify: 0.52, medianDaysToVerify: 38, halfLifeWeeks: 41 }, billable: "yes", guardrails: ["net_sales", "covers", "ticket_time", "rating", "overtime"] },
  purchasing: { label: "Purchasing", family: "A", domain: "Purchasing", recoveryFactor: 0.66, prior: { pVerify: 0.71, medianDaysToVerify: 24, halfLifeWeeks: 99 }, billable: "yes", guardrails: ["comps", "rating"] },
  portion: { label: "Portion & prep", family: "C", domain: "Kitchen", recoveryFactor: 0.72, prior: { pVerify: 0.44, medianDaysToVerify: 31, halfLifeWeeks: 12 }, billable: "with_error_bar", guardrails: ["rating", "covers"] },
  comps: { label: "Comps & voids", family: "A", domain: "Service", recoveryFactor: 0.55, prior: { pVerify: 0.58, medianDaysToVerify: 35, halfLifeWeeks: 34 }, billable: "yes", guardrails: ["rating", "covers", "net_sales"] },
  menu_price: { label: "Menu price", family: "B", domain: "Menu", recoveryFactor: 0.61, prior: { pVerify: 0.39, medianDaysToVerify: 44, halfLifeWeeks: 52 }, billable: "lower_bound", guardrails: ["covers", "check_average", "net_sales"] },
  mix_shift: { label: "Mix shift", family: "B", domain: "Menu", recoveryFactor: 0.4, prior: { pVerify: 0.21, medianDaysToVerify: 56, halfLifeWeeks: 18 }, billable: "never", guardrails: ["covers", "net_sales"] },
  ticket_time: { label: "Ticket / turn time", family: "B", domain: "Throughput", recoveryFactor: 0.34, prior: { pVerify: 0.18, medianDaysToVerify: 62, halfLifeWeeks: 22 }, billable: "where_unmet_demand", guardrails: ["ticket_time", "rating", "overtime"] },
};

export function leverMeta(l: string): LeverMeta {
  const m = LEVERS[l as Lever];
  if (!m) throw new Error(`unknown lever ${l}`);
  return m;
}
