/** Tiny trend line with a 10% area; no axes. Colour is a token, never a data colour. */
export function Sparkline({ values, stroke = "var(--claim-book)", height = 40, className }: { values: number[]; stroke?: string; height?: number; className?: string }) {
  if (values.length < 2) return <svg className={`chart ${className ?? ""}`} viewBox={`0 0 120 ${height}`} height={height} aria-hidden="true" />;
  const w = 120;
  const h = height;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `M0,${h} L${line.replace(/ /g, " L")} L${w},${h} Z`;
  return (
    <svg className={`chart ${className ?? ""}`} viewBox={`0 0 ${w} ${h}`} height={height} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={stroke} opacity="0.1" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
