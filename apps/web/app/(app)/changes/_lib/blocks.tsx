/**
 * Blocks shared by the change record and the proof packet. Every figure is
 * read off the record and formatted; nothing here derives a new number.
 */
import type { Adjustment, Bridge, GateRun, GuardrailResult, HistoryEvent, InterventionEval, LedgerSide, ScaledEstimate } from "@streamline/contracts";
import { GateRow, Kv, Pill } from "@streamline/ui";
import Link from "next/link";
import { formatDate, formatPct, formatUsd } from "../../../../lib/format";
import { withScope } from "../../../../lib/scope";
import { PERSISTENCE_CLASS_LABEL, PERSISTENCE_STATUS_LABEL, reconTone } from "./labels";

const two = (n: number) => n.toFixed(2);

/* ---------- the mint (G8) ------------------------------------------------- */

/**
 * bookable = max(0, point − t·SE − incremental cost − unresolved overlap).
 * Each line shows the figure the mint used, as stored; the products and the
 * subtraction happened in the engine, not here.
 */
export function MintTable({ iv, estimate, bookableCents, compact = false }: { iv: Pick<InterventionEval, "incrementalCostCents" | "overlapDeductionCents" | "overlapStatus">; estimate: ScaledEstimate; bookableCents: number; compact?: boolean }) {
  const cost = iv.incrementalCostCents ?? 0;
  const overlap = iv.overlapDeductionCents ?? 0;
  return (
    <div className="tw">
      <table className={`t ch-mint ${compact ? "dense" : ""}`}>
        <thead>
          <tr>
            <th>Step</th>
            <th className="r">Figure</th>
            {!compact && <th>Basis</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Point estimate</td>
            <td className="r">{formatUsd(estimate.point)}/wk</td>
            {!compact && <td className="muted">Scaled to the week × {estimate.wkBasis}</td>}
          </tr>
          <tr>
            <td>less t × SE</td>
            <td className="r">
              t {two(estimate.tcrit)} × {formatUsd(estimate.se)}
            </td>
            {!compact && <td className="muted">One-sided 95%, {Number.isInteger(estimate.df) ? estimate.df : estimate.df.toFixed(1)} degrees of freedom</td>}
          </tr>
          <tr>
            <td>= lower bound</td>
            <td className="r">{formatUsd(estimate.lower)}/wk</td>
            {!compact && <td className="muted">The conservative end of the interval</td>}
          </tr>
          <tr>
            <td>less incremental cost</td>
            <td className="r">{cost ? `${formatUsd(cost)} one-time` : "none"}</td>
            {!compact && <td className="muted">{cost ? "Amortised across 52 weeks by the mint" : "No cost was declared for this change"}</td>}
          </tr>
          <tr>
            <td>less unresolved overlap</td>
            <td className="r">{overlap ? formatUsd(overlap) : "none"}</td>
            {!compact && <td className="muted">{iv.overlapStatus && iv.overlapStatus !== "none" ? `Overlap ${iv.overlapStatus}` : "No intersecting claim on this scope, period and account"}</td>}
          </tr>
          <tr className="tot">
            <td>Bookable /wk</td>
            <td className="r tone-book">{formatUsd(bookableCents)}</td>
            {!compact && (
              <td className="muted" style={{ fontWeight: 400 }}>
                max(0, …) — written by the verification decision service and nothing else
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------- the estimate ------------------------------------------------- */

function moneyRows(e: ScaledEstimate) {
  return [
    { k: "Point estimate", v: `${formatUsd(e.point)}/wk`, mono: true },
    { k: "Standard error", v: formatUsd(e.se), mono: true },
    { k: "Degrees of freedom", v: Number.isInteger(e.df) ? String(e.df) : e.df.toFixed(1), mono: true },
    { k: "Critical t, one-sided 95%", v: two(e.tcrit), mono: true },
    { k: "90% interval", v: `${formatUsd(e.ci[0])} to ${formatUsd(e.ci[1])}`, mono: true },
    { k: "Lower bound", v: `${formatUsd(e.lower)}/wk — the figure the mint starts from`, mono: true },
    { k: "Minimum detectable effect", v: `${formatUsd(e.mde)}/wk, fixed before the window opened`, mono: true },
  ];
}

function PlaceboCell({ e }: { e: ScaledEstimate }) {
  if (e.placebo.note) return <span>{e.placebo.note}</span>;
  return e.placebo.pass ? (
    <span>
      Passed — t = {two(e.placebo.t)} against {two(e.placebo.crit)}
    </span>
  ) : (
    <span className="tone-bad" style={{ fontWeight: 600 }}>
      FAILED — the control is not parallel. The result is inconclusive, not smaller.
    </span>
  );
}

/** DiD: the four cells, the per-unit difference, the scaling, the interval, the placebo. */
export function DidEstimateKv({ iv, e }: { iv: Pick<InterventionEval, "plan" | "direction">; e: ScaledEstimate }) {
  const unit = <span className="muted"> · {iv.plan.primary.toLowerCase()}</span>;
  const dir = iv.direction === "down_is_saving" ? "down is a saving" : "up is a saving";
  return (
    <Kv
      rows={[
        {
          k: "Treated, before → after",
          v: (
            <>
              <span className="mono">
                {two(e.means.Tpre)} → {two(e.means.Tpost)}
              </span>
              {unit}
            </>
          ),
        },
        {
          k: "Control, before → after",
          v: (
            <>
              <span className="mono">
                {two(e.means.Cpre)} → {two(e.means.Cpost)}
              </span>
              {unit}
            </>
          ),
        },
        { k: "DiD per unit", v: `${two(e.rawPoint)} (${dir})`, mono: true },
        { k: "Scaled to the week", v: `× ${e.wkBasis}` },
        ...moneyRows(e),
        { k: "Placebo parallel-trends", v: <PlaceboCell e={e} /> },
        { k: "Pre-period fit r", v: two(e.preFit), mono: true },
        { k: "Observations", v: `treated ${e.n.Tpre} before, ${e.n.Tpost} after · control ${e.n.Cpre} before, ${e.n.Cpost} after`, mono: true },
      ]}
    />
  );
}

/** Reconciliation (family A): the index is disclosed, not used as a control. */
export function ReconcileEstimateKv({ e }: { e: ScaledEstimate }) {
  return (
    <Kv
      rows={[
        { k: "Method", v: "Direct reconciliation against the vendor index (disclosed, not a control)" },
        {
          k: "Treated, before → after",
          v: (
            <span className="mono">
              {two(e.means.Tpre)} → {two(e.means.Tpost)}
            </span>
          ),
        },
        { k: "Change per unit", v: two(e.rawPoint), mono: true },
        { k: "Scaled to the week", v: `× ${e.wkBasis}` },
        ...moneyRows(e),
        ...(e.indexShare != null ? [{ k: "Concurrent vendor index", v: `${formatPct(e.indexShare, 0)} of the observed move${e.indexMove != null ? ` (index moved ${two(e.indexMove)})` : ""}` }] : []),
        ...(e.attributionNote ? [{ k: "Attribution note", v: e.attributionNote }] : []),
        { k: "Placebo", v: <PlaceboCell e={e} /> },
        { k: "Observations", v: `${e.n.Tpre} before, ${e.n.Tpost} after`, mono: true },
      ]}
    />
  );
}

/* ---------- guardrails and gates ----------------------------------------- */

export function GuardrailRows({ results, windowOpen }: { results: GuardrailResult[]; windowOpen: boolean }) {
  if (!results.length) return <div className="note">No guardrail was declared on the plan. A missing guardrail is a failure, not a pass.</div>;
  return (
    <div>
      {results.map((g) => {
        const status = g.observed == null ? "soft" : g.passed ? "pass" : "fail";
        const detail = g.observed == null ? (windowOpen ? "Not yet observed — a guardrail that is never observed counts as a failure, not a pass." : "Not observed = failure, not pass.") : `${g.observedLabel} · limit ${g.thresholdLabel}${g.why ? ` · ${g.why}` : ""}`;
        return <GateRow key={g.id} status={status} label={g.label} detail={detail} />;
      })}
    </div>
  );
}

export function GateRows({ gateRun }: { gateRun: GateRun }) {
  return (
    <div>
      {gateRun.gates.map((g) => (
        <GateRow key={g.id} status={g.passed ? "pass" : g.blocking ? "fail" : "soft"} label={`${g.label}${!g.blocking ? " (non-blocking)" : ""}`} detail={g.detail} />
      ))}
    </div>
  );
}

/* ---------- persistence (G12) -------------------------------------------- */

/** Weekly effect re-estimated after the window, with the verified level dashed. Coordinates only. */
export function PersistenceChart({ series, verifiedCents, height = 120 }: { series: Array<{ date: string; y: number }>; verifiedCents: number; height?: number }) {
  if (series.length < 2) return <div className="note">Not enough post-window weeks to draw yet.</div>;
  const w = 720;
  const h = height;
  const padL = 56;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const ys = [...series.map((p) => p.y), verifiedCents];
  const rawLo = Math.min(...ys);
  const rawHi = Math.max(...ys);
  const pad = (rawHi - rawLo || Math.abs(rawHi) || 1) * 0.25;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const span = hi - lo || 1;
  const x = (i: number) => padL + (i / (series.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (h - padT - padB);
  const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  return (
    <figure className="stack" style={{ gap: 4 }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Weekly effect after the window against the verified level">
        {[lo, hi].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end">
              {formatUsd(Math.round(v))}
            </text>
          </g>
        ))}
        <line x1={padL} x2={w - padR} y1={y(verifiedCents)} y2={y(verifiedCents)} stroke="var(--claim-book)" strokeDasharray="5 4" strokeWidth="1.5" />
        <text x={padL + 4} y={y(verifiedCents) + 12}>
          verified {formatUsd(verifiedCents)}/wk
        </text>
        <polyline points={line} fill="none" stroke="var(--claim-cau)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <text x={padL} y={h - 6}>
          {formatDate(series[0]!.date)}
        </text>
        <text x={w - padR} y={h - 6} textAnchor="end">
          {formatDate(series[series.length - 1]!.date)}
        </text>
      </svg>
      <figcaption className="legend">
        <span>
          <i className="sw" style={{ background: "var(--claim-cau)" }} />
          weekly effect re-estimated after the window
        </span>
        <span>
          <i className="sw" style={{ background: "var(--claim-book)" }} />
          dashed = verified level
        </span>
      </figcaption>
    </figure>
  );
}

export function PersistenceKv({ iv }: { iv: Pick<InterventionEval, "persistence"> }) {
  const p = iv.persistence;
  if (!p) return null;
  return (
    <Kv
      rows={[
        { k: "Class", v: p.cls ? PERSISTENCE_CLASS_LABEL[p.cls] : "Not yet classed" },
        { k: "Status", v: PERSISTENCE_STATUS_LABEL[p.status] },
        { k: "Half-life", v: p.halfLifeWeeks == null ? "none detected — the decay interval includes zero" : `${p.halfLifeWeeks.toFixed(1)} weeks`, mono: p.halfLifeWeeks != null },
        { k: "Checks passed", v: String(p.checks), mono: true },
        ...(p.elapsedWeeks != null ? [{ k: "Elapsed weeks", v: String(p.elapsedWeeks), mono: true }] : []),
        ...(p.retention != null ? [{ k: "Retention", v: `${formatPct(p.retention, 0)} of the verified rate`, mono: true }] : []),
        ...(p.note ? [{ k: "Note", v: p.note }] : []),
      ]}
    />
  );
}

/* ---------- the P&L bridge ----------------------------------------------- */

export function BridgeFigures({ bridge, side }: { bridge: Bridge; side: LedgerSide | null }) {
  return (
    <Kv
      rows={[
        { k: `Claim for ${side?.periodLabel ?? "the period"}`, v: formatUsd(bridge.claimCents), mono: true },
        { k: "Observed in the ledger", v: formatUsd(bridge.observedCents), mono: true },
        { k: "Timing", v: bridge.timingCents ? formatUsd(bridge.timingCents) : "none", mono: true },
        { k: "Unexplained", v: bridge.unexplainedCents ? formatUsd(bridge.unexplainedCents) : "none", mono: true },
        { k: "Account", v: bridge.account },
      ]}
    />
  );
}

export function BridgeLinesTable({ bridge }: { bridge: Bridge }) {
  return (
    <div className="tw">
      <table className="t dense">
        <tbody>
          {bridge.lines.map((l, i) => (
            <tr key={i}>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>
                {l.k}
              </td>
              <td>{l.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BridgeStatusNote({ bridge, side }: { bridge: Bridge; side: LedgerSide | null }) {
  const ok = bridge.status === "reconciled";
  return (
    <div className={`note ${ok ? "note-ok" : "note-est"}`}>
      <strong>{bridge.statusLabel}.</strong> Reconciled figure {formatUsd(bridge.reconciledCents)} — the fee basis is the reconciled figure.
      {side?.explanation ? ` ${side.explanation}.` : ""}
      {side?.reviewer ? ` Reviewed by ${side.reviewer}.` : ""}
    </div>
  );
}

export function ReconPill({ status, label }: { status: Bridge["status"] | null; label: string }) {
  return <Pill tone={reconTone(status)}>{label}</Pill>;
}

/* ---------- adjustments -------------------------------------------------- */

export function adjustmentTone(kind: Adjustment["kind"]): "bad" | "est" {
  return kind === "Dispute" ? "est" : "bad";
}

export function AdjustmentList({ adjustments, scope, linkToChange = false }: { adjustments: Adjustment[]; scope?: string; linkToChange?: boolean }) {
  if (!adjustments.length) return <div className="note">No adjustment on this record. A reversal or a decay would appear here beside the claim, never inside it.</div>;
  return (
    <div className="stack">
      {adjustments.map((a) => (
        <div key={a.id} className="ch-adj" id={a.id}>
          <div className="ch-adj-top">
            <span className="pills">
              <Pill tone={adjustmentTone(a.kind)}>{a.kind}</Pill>
              <span className="mono xs">{a.id}</span>
              <Pill tone={a.status === "open" ? "est" : "ghost"}>{a.status}</Pill>
            </span>
            <span className="mono tone-bad ch-adj-amt">{formatUsd(a.cents, { sign: true })}</span>
          </div>
          <div className="small">
            {linkToChange ? <Link href={withScope(`/changes/${a.interventionId}`, scope)}>{a.title}</Link> : a.title} · {formatDate(a.on)} · {a.by}
            {a.weeks ? ` · ${a.weeks} weeks` : ""}
          </div>
          <div className="small">{a.reason}</div>
          {a.note && <div className="xs">{a.note}</div>}
          {a.foundBy && <div className="xs">Found by: {a.foundBy}</div>}
          {a.kind === "Dispute" && a.status === "open" && <Pill tone="est">Blocks the fee on this claim</Pill>}
        </div>
      ))}
    </div>
  );
}

/* ---------- declared history --------------------------------------------- */

/** The intervention's own history events, when no audit rows exist yet for it. */
export function HistoryList({ history }: { history: HistoryEvent[] }) {
  if (!history.length) return <div className="note">No events recorded yet.</div>;
  return (
    <div className="timeline">
      {history.map((e, i) => (
        <div key={i} className="tl-row">
          <div className="tl-when">{formatDate(e.on)}</div>
          <div>
            <div className="tl-what">{e.state.replace(/_/g, " ")}</div>
            <div className="tl-who">{e.by}</div>
            {e.note && <div className="tl-why">{e.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
