import type { DriftOnset, SeriesPoint } from "@streamline/contracts";
import { formatDate } from "../../lib/format";

/**
 * The control chart that fired: the observed series, the baseline mean and
 * ±3σ limits from the baseline window, the onset (amber) and the signal (red).
 * Every line is a token colour: observed ink, limits red dashed, onset amber.
 */
export function ControlChart({ series, baselineN, onset, unit = "ratio", height = 220, title }: { series: SeriesPoint[]; baselineN: number | null; onset: DriftOnset | null; unit?: string; height?: number; title?: string }) {
  const pts = series.slice(-160);
  if (pts.length < 3) return <div className="note">Not enough observations to chart.</div>;
  const w = 720;
  const h = height;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const n = Math.max(2, Math.min(baselineN ?? 28, pts.length));
  const base = pts.slice(0, n).map((p) => p.v);
  const mu = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, base.length - 1)) || 1e-9;
  const ucl = mu + 3 * sd;
  const lcl = mu - 3 * sd;
  const vals = pts.map((p) => p.v);
  const lo = Math.min(...vals, lcl);
  const hi = Math.max(...vals, ucl);
  const span = hi - lo || 1;
  const x = (i: number) => padL + (i / (pts.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (h - padT - padB);
  const fmt = (v: number) => (unit === "ratio" ? `${(v * 100).toFixed(1)}%` : unit === "cents" ? `$${(v / 100).toFixed(0)}` : v.toFixed(1));
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const onsetIdx = onset ? pts.findIndex((p) => p.date >= onset.onsetDate) : -1;
  const sigIdx = onset ? pts.findIndex((p) => p.date >= onset.signalDate) : -1;
  const ticks = [lo, mu, hi];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return (
    <figure className="stack" style={{ gap: 4 }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title ?? "Control chart"}>
        <rect x={padL} y={y(ucl)} width={w - padL - padR} height={Math.max(0, y(lcl) - y(ucl))} fill="var(--claim-book)" opacity="0.05" />
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={w - padR} y1={y(ucl)} y2={y(ucl)} stroke="var(--claim-bad)" strokeDasharray="4 4" strokeWidth="1" />
        <line x1={padL} x2={w - padR} y1={y(lcl)} y2={y(lcl)} stroke="var(--claim-bad)" strokeDasharray="4 4" strokeWidth="1" />
        <line x1={padL} x2={w - padR} y1={y(mu)} y2={y(mu)} stroke="var(--fg-3)" strokeWidth="1" />
        <line x1={x(Math.min(n - 1, pts.length - 1))} x2={x(Math.min(n - 1, pts.length - 1))} y1={padT} y2={h - padB} stroke="var(--border-strong)" strokeDasharray="2 3" />
        <polyline points={line} fill="none" stroke="var(--fg-1)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (p.v > ucl || p.v < lcl ? <circle key={p.date} cx={x(i)} cy={y(p.v)} r="2.6" fill="var(--claim-bad)" /> : null))}
        {onsetIdx >= 0 && (
          <g>
            <line x1={x(onsetIdx)} x2={x(onsetIdx)} y1={padT} y2={h - padB} stroke="var(--claim-est)" strokeWidth="1.5" />
            <text x={x(onsetIdx) + 4} y={padT + 10} fill="var(--claim-est)" style={{ fill: "var(--claim-est)" }}>
              drift started {formatDate(onset!.onsetDate)}
            </text>
          </g>
        )}
        {sigIdx >= 0 && sigIdx !== onsetIdx && <line x1={x(sigIdx)} x2={x(sigIdx)} y1={padT} y2={h - padB} stroke="var(--claim-bad)" strokeDasharray="4 3" strokeWidth="1" />}
        <text x={padL} y={h - 8}>
          {formatDate(first.date)}
        </text>
        <text x={w - padR} y={h - 8} textAnchor="end">
          {formatDate(last.date)}
        </text>
      </svg>
      <figcaption className="legend">
        <span>
          <i className="sw" style={{ background: "var(--fg-1)" }} />
          observed
        </span>
        <span>
          <i className="sw" style={{ background: "var(--fg-3)" }} />
          baseline mean ({n} observations)
        </span>
        <span>
          <i className="sw" style={{ background: "var(--claim-bad)" }} />
          ±3σ control limits · signals
        </span>
        <span>
          <i className="sw" style={{ background: "var(--claim-est)" }} />
          drift onset (change-point)
        </span>
      </figcaption>
    </figure>
  );
}
