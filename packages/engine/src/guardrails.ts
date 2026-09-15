/**
 * Guardrails — Doctrine 6. What is not allowed to get worse, measured over the
 * same window as the primary effect. A breach requires the optimistic end of
 * the interval to be past the limit; a missing guardrail is a failure, not a pass.
 */
import type { IsoDate } from "./dates";
import { did, reconcileA, svSeries, toWeekly, type Estimate, type ServiceScope } from "./measure";
import { formatPct, formatUsd } from "./money";
import type { Register, Service } from "./register";

export interface GuardrailDef {
  label: string;
  metric: (s: Service) => number;
  /** Which direction is bad. */
  worse: "up" | "down";
  /** Relative tolerance on the pre-period mean (e.g. −0.03) … */
  tolPct?: number;
  /** … or an absolute tolerance in the metric's own unit. */
  tolAbs?: number;
  fmt: (v: number) => string;
}

export const GUARDRAILS: Record<string, GuardrailDef> = {
  net_sales: { label: "Net sales", metric: (s) => s.netCents, worse: "down", tolPct: -0.03, fmt: (v) => formatUsd(v) },
  covers: { label: "Covers", metric: (s) => s.covers, worse: "down", tolPct: -0.04, fmt: (v) => `${v.toFixed(1)} covers` },
  ticket_time: { label: "Ticket time", metric: (s) => s.ticketMin, worse: "up", tolAbs: 1.5, fmt: (v) => `${v.toFixed(1)} min` },
  rating: { label: "Guest rating", metric: (s) => s.rating, worse: "down", tolAbs: -0.15, fmt: (v) => v.toFixed(2) },
  overtime: { label: "Overtime elsewhere", metric: (s) => s.hours, worse: "up", tolPct: 0.05, fmt: (v) => `${v.toFixed(1)} h` },
  comps: { label: "Comps rate", metric: (s) => s.compsCents / Math.max(s.grossCents, 1), worse: "up", tolAbs: 0.006, fmt: (v) => formatPct(v, 2) },
  check_average: { label: "Check average", metric: (s) => s.netCents / Math.max(s.covers, 1), worse: "down", tolPct: -0.03, fmt: (v) => formatUsd(v, { dp: 2 }) },
};

export interface GuardrailResult {
  id: string;
  label: string;
  /** Observed movement (point estimate) in the metric's unit; null when unobservable. */
  observed: number | null;
  passed: boolean;
  observedLabel: string;
  thresholdLabel: string;
  why?: string;
  optimistic?: number;
  baseline?: number;
  tol?: number;
  est?: Estimate;
  /** Pre/post without a control is disclosed rather than hidden. */
  mode?: "did" | "pre/post";
}

export interface RunGuardrailsArgs {
  treatScope: ServiceScope;
  controlScope: ServiceScope | null;
  execDate: IsoDate;
  preDays: number;
  postDays: number;
  weekly: boolean;
}

export function runGuardrails(reg: Register, ids: readonly string[], args: RunGuardrailsArgs): GuardrailResult[] {
  return ids.map((id) => {
    const g = GUARDRAILS[id];
    if (!g) {
      return { id, label: id, observed: null, passed: false, observedLabel: "—", thresholdLabel: "—", why: "No observation source for this guardrail. A missing guardrail is a failure, not a pass." };
    }
    let t = svSeries(reg, args.treatScope, g.metric);
    let c = args.controlScope ? svSeries(reg, args.controlScope, g.metric) : null;
    if (args.weekly) {
      t = toWeekly(t);
      if (c) c = toWeekly(c);
    }
    let e: Estimate;
    let mode: "did" | "pre/post" = "did";
    if (c) {
      e = did({ treatment: t, control: c, execDate: args.execDate, preDays: args.preDays, postDays: args.postDays });
    } else {
      // No control scope means the change was group-wide: read pre/post against
      // the treated scope's own history and disclose the weaker counterfactual.
      const r = reconcileA({ observed: t, index: null, execDate: args.execDate, preDays: args.preDays, postDays: args.postDays });
      e = r.ok ? { ...r, point: -r.point, lower: -r.upper, upper: -r.lower } : r;
      mode = "pre/post";
    }
    if (!e.ok) {
      return { id, label: g.label, observed: null, passed: false, observedLabel: "—", thresholdLabel: "—", why: "The window could not be formed for this guardrail.", mode };
    }
    const base = e.means.Tpre;
    const tol = g.tolAbs !== undefined ? g.tolAbs : base * (g.tolPct ?? 0);
    // Breach only when the evidence says the metric moved past the tolerance —
    // the optimistic end of the interval must still be worse than the limit.
    const optimistic = g.worse === "down" ? e.point + e.tcrit * e.se : e.point - e.tcrit * e.se;
    const passed = g.worse === "down" ? optimistic >= tol : optimistic <= tol;
    return {
      id,
      label: g.label,
      observed: e.point,
      est: e,
      passed,
      optimistic,
      observedLabel: `moved ${g.fmt(e.point)}${g.tolAbs === undefined ? ` (${formatPct(e.point / Math.max(Math.abs(base), 1e-9), 1)})` : ""}, 95% bound ${g.fmt(optimistic)}`,
      thresholdLabel: g.fmt(tol),
      baseline: base,
      tol,
      mode,
    };
  });
}
