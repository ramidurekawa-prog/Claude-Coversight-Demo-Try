import type { DatedValue } from "@streamline/contracts";
import { formatDate } from "../../lib/format";

/**
 * Treatment vs control around execution. Control is ink-4, treated is the
 * bookable green, the counterfactual (control shifted to the treated pre-mean)
 * is causal purple dashed. The gap at the end is the effect the estimator sized.
 */
export function DidChart({ treatment, control, execDate, eligibleOn, unitLabel = "per unit", height = 240 }: { treatment: DatedValue[]; control: DatedValue[]; execDate: string; eligibleOn?: string; unitLabel?: string; height?: number }) {
  const t = treatment.slice(-40);
  const cMap = new Map(control.map((p) => [p.date, p.y]));
  const c = t.map((p) => ({ date: p.date, y: cMap.get(p.date) ?? null }));
  if (t.length < 4) return <div className="note">Not enough observations to chart.</div>;
  const w = 720;
  const h = height;
  const padL = 48;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const pre = t.filter((p) => p.date < execDate);
  const preC = c.filter((p) => p.date < execDate && p.y != null);
  const shift = pre.length && preC.length ? pre.reduce((a, p) => a + p.y, 0) / pre.length - preC.reduce((a, p) => a + (p.y as number), 0) / preC.length : 0;
  const cf = c.map((p) => ({ date: p.date, y: p.y == null ? null : p.y + shift }));
  const all = [...t.map((p) => p.y), ...c.map((p) => p.y).filter((v): v is number => v != null), ...cf.map((p) => p.y).filter((v): v is number => v != null)];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => padL + (i / (t.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (h - padT - padB);
  const path = (pts: Array<{ y: number | null }>) => pts.map((p, i) => (p.y == null ? null : `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`)).filter(Boolean).join(" ");
  const execIdx = t.findIndex((p) => p.date >= execDate);
  const eligIdx = eligibleOn ? t.findIndex((p) => p.date >= eligibleOn) : -1;
  const lastT = t[t.length - 1]!;
  const lastCf = cf[cf.length - 1]!;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? `$${(v / 100).toFixed(0)}` : v.toFixed(2));
  return (
    <figure className="stack" style={{ gap: 4 }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Treatment versus control">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        ))}
        {execIdx >= 0 && (
          <g>
            <rect x={x(execIdx)} y={padT} width={(eligIdx > execIdx ? x(eligIdx) : w - padR) - x(execIdx)} height={h - padT - padB} fill="var(--claim-cau)" opacity="0.06" />
            <line x1={x(execIdx)} x2={x(execIdx)} y1={padT} y2={h - padB} stroke="var(--fg-2)" strokeDasharray="3 3" />
            <text x={x(execIdx) + 4} y={padT + 10}>
              executed {formatDate(execDate)}
            </text>
          </g>
        )}
        <polyline points={path(c)} fill="none" stroke="var(--fg-3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={path(cf)} fill="none" stroke="var(--claim-cau)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <polyline points={path(t)} fill="none" stroke="var(--claim-book)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {lastCf.y != null && <line x1={x(t.length - 1)} x2={x(t.length - 1)} y1={y(lastT.y)} y2={y(lastCf.y)} stroke="var(--claim-book)" strokeWidth="4" strokeLinecap="round" opacity="0.6" />}
        <text x={padL} y={h - 8}>
          {formatDate(t[0]!.date)}
        </text>
        <text x={w - padR} y={h - 8} textAnchor="end">
          {formatDate(lastT.date)}
        </text>
      </svg>
      <figcaption className="legend">
        <span>
          <i className="sw" style={{ background: "var(--claim-book)" }} />
          treated ({unitLabel})
        </span>
        <span>
          <i className="sw" style={{ background: "var(--fg-3)" }} />
          control
        </span>
        <span>
          <i className="sw" style={{ background: "var(--claim-cau)" }} />
          counterfactual — what would have happened anyway
        </span>
      </figcaption>
    </figure>
  );
}
