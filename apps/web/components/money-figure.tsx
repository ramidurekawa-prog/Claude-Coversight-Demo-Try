import type { Kpi, MoneyJson } from "@streamline/contracts";
import { Pill } from "@streamline/ui";
import { classLabel, formatPct, formatUsd, toneOfClass } from "../lib/format";

/** A KPI card: one class per number, labelled. Never a total across classes. */
export function KpiCard({ kpi, href, foot }: { kpi: Kpi; href?: string; foot?: string }) {
  const isMoney = typeof kpi.value !== "number";
  const tone = isMoney ? toneOfClass((kpi.value as MoneyJson).klass) : "neu";
  const value = isMoney ? formatUsd((kpi.value as MoneyJson).cents) : kpi.isPct ? formatPct(kpi.value as number, 0) : kpi.isRatio ? `${(kpi.value as number).toFixed(2)}×` : String(kpi.value);
  const body = (
    <>
      <div className="kpi-label">{kpi.label}</div>
      <div className={`kpi-value tone-${tone}`}>{value}</div>
      <div className="kpi-foot">
        {isMoney ? <Pill tone={tone}>{classLabel((kpi.value as MoneyJson).klass)}</Pill> : <span>{kpi.klass !== "—" ? kpi.klass : ""}</span>} {foot ?? ""}
      </div>
    </>
  );
  const cls = `kpi kpi-${tone} ${href ? "drill" : ""}`;
  return href ? (
    <a className={cls} href={href} title={kpi.definition} style={{ textDecoration: "none", color: "inherit" }}>
      {body}
    </a>
  ) : (
    <div className={cls} title={kpi.definition}>
      {body}
    </div>
  );
}

/** Inline money with its class pill. */
export function MoneyInline({ cents, klass, suffix = "/wk" }: { cents: number; klass: MoneyJson["klass"]; suffix?: string }) {
  const tone = toneOfClass(klass);
  return (
    <span className="row" style={{ gap: 6, display: "inline-flex" }}>
      <span className={`mono tone-${tone}`} style={{ fontWeight: 600 }}>
        {formatUsd(cents)}
        {suffix}
      </span>
      <Pill tone={tone}>{classLabel(klass)}</Pill>
    </span>
  );
}
