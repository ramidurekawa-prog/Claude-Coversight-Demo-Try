import { formatDate, formatUsd } from "../../lib/format";

/** Realized accrual: cumulative area in bookable green; monthly bars beneath with adjustments in red beside them, never netted. */
export function AccrualChart({ cumulative, byMonth, height = 200 }: { cumulative: Array<{ date: string; y: number }>; byMonth: Array<{ month: string; cents: number; adjustmentsCents: number; feeCents: number }>; height?: number }) {
  if (cumulative.length < 2) return <div className="note">No realized value has accrued yet. Value accrues daily from the day a claim becomes eligible, at the verified weekly rate, decayed by persistence class.</div>;
  const w = 720;
  const h = height;
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const max = Math.max(...cumulative.map((p) => p.y)) || 1;
  const x = (i: number) => padL + (i / (cumulative.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const line = cumulative.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const area = `M${x(0)},${y(0)} L${line.replace(/ /g, " L")} L${x(cumulative.length - 1)},${y(0)} Z`;
  return (
    <figure className="stack" style={{ gap: 8 }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Cumulative realized value">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={w - padR} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" />
            <text x={padL - 6} y={y(max * f) + 3} textAnchor="end">
              {formatUsd(Math.round(max * f))}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--claim-book)" opacity="0.12" />
        <polyline points={line} fill="none" stroke="var(--claim-book)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <text x={padL} y={h - 6}>
          {formatDate(cumulative[0]!.date)}
        </text>
        <text x={w - padR} y={h - 6} textAnchor="end">
          {formatDate(cumulative[cumulative.length - 1]!.date)}
        </text>
      </svg>
      <div className="tw">
        <table className="t dense">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Realized</th>
              <th className="r">Adjustments</th>
              <th className="r">Fee</th>
            </tr>
          </thead>
          <tbody>
            {byMonth.map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td className="r tone-book">{formatUsd(m.cents)}</td>
                <td className={`r ${m.adjustmentsCents ? "tone-bad" : "muted"}`}>{m.adjustmentsCents ? formatUsd(m.adjustmentsCents, { sign: true }) : "—"}</td>
                <td className="r muted">{formatUsd(m.feeCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
