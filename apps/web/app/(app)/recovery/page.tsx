import { RecoveryResponse, type ConversionMetric, type Kpi, type MoneyJson } from "@streamline/contracts";
import { Card, CardBody, CardHead, EmptyState, Meter, Pill, Section } from "@streamline/ui";
import { Filter } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FunnelBars } from "../../../components/charts/funnel-bars";
import { KpiCard } from "../../../components/money-figure";
import { classLabel, formatPct, formatUsd, toneOfClass } from "../../../lib/format";
import { withScope } from "../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Profit Recovery" };
export const dynamic = "force-dynamic";

/** The four classes shown under the hero, in funnel order. Never summed. */
const CLASS_KPIS = ["exposure", "active", "measured", "verified"] as const;

function isMoney(v: Kpi["value"]): v is MoneyJson {
  return typeof v !== "number";
}

/** How a conversion metric reads. The contract carries no unit: the direction (`dir`) says whether a value is a share, a day count or a multiple. */
function metricValue(m: ConversionMetric): { text: string; ratio: number | null } {
  if (m.value == null) return { text: "—", ratio: null };
  switch (m.dir) {
    case "gte":
    case "band":
      return { text: formatPct(m.value, 0), ratio: m.value };
    case "lte_days":
      return { text: `${Math.round(m.value)} days`, ratio: null };
    case "gte_x":
      return { text: `${m.value.toFixed(2)}×`, ratio: null };
    default:
      return { text: m.id === "vpl" ? `${formatUsd(m.value)} per location` : String(Math.round(m.value * 100) / 100), ratio: null };
  }
}

function metricTarget(m: ConversionMetric): string {
  if (m.target == null) return "—";
  if (Array.isArray(m.target)) return `${formatPct(m.target[0], 0)}–${formatPct(m.target[1], 0)}`;
  switch (m.dir) {
    case "gte":
      return `≥ ${formatPct(m.target, 0)}`;
    case "lte_days":
      return `≤ ${m.target} days`;
    case "gte_x":
      return `≥ ${m.target}×`;
    default:
      return String(m.target);
  }
}

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const r = await serverApi(RecoveryResponse, `/api/v1/recovery${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const K = Object.fromEntries(r.kpis.map((k) => [k.id, k])) as Record<string, Kpi | undefined>;
  const rec = K.recoverable;
  const recMoney = rec && isMoney(rec.value) ? rec.value : null;
  const openf = K.openf;
  const nothingYet = r.funnel.every((s) => s.n === 0);

  return (
    <div className="page">
      {rec && recMoney && !nothingYet ? (
        <section className="hero est" aria-labelledby="rc-hero-title">
          <div>
            <div className="kpi-label" id="rc-hero-title">
              {rec.label} · {r.period.label}
            </div>
            <div className="hero-fig mono">
              {formatUsd(recMoney.cents)}
              <span className="unit">a week, if every open finding worked</span>
            </div>
            <div className="hero-tail">What is on the table before anything is executed.</div>
            <p className="hero-sub">{rec.read} {rec.definition} The lever&apos;s recovery factor has been applied and every overlap deducted; nothing here is a saving until a window closes and the gates pass.</p>
            <div className="hero-formal">
              <Pill tone={toneOfClass(recMoney.klass)}>{classLabel(recMoney.klass)}</Pill>
              <span className="term" title={rec.definition}>
                {rec.contract.lineage}
              </span>
              <span>{rec.contract.locationScope}</span>
              <span>calc {rec.contract.calcVersion}</span>
            </div>
          </div>
          {openf && typeof openf.value === "number" && (
            <div className="hero-side">
              <div className="big mono">{openf.value}</div>
              <div className="cap">{openf.label.toLowerCase()} — {openf.read.toLowerCase()}</div>
              <Link href={withScope("/findings", scope)} className="xs">
                See the findings →
              </Link>
            </div>
          )}
        </section>
      ) : (
        <EmptyState icon={<Filter size={20} />} title="No recoverable opportunity yet" description="Detectors need a full baseline before a finding can be qualified. Until then the top of this funnel is empty, and that is the honest state." />
      )}

      <div className="rc-classes">
        {CLASS_KPIS.map((id) => (K[id] ? <KpiCard key={id} kpi={K[id]!} href={withScope(id === "verified" ? "/proof" : id === "exposure" ? "/findings" : "/changes", scope)} /> : null))}
      </div>
      <p className="after">Four numbers, four classes. They are never added together. Exposure is what the detectors see; active is what is in flight; measured is what a closed window observed before the gates; verified is what survived them.</p>

      <Section title="The funnel — detected → qualified → accepted → executed → measured → verified → persistent → reconciled" sub="Counts and dollars per stage, each in its own class, with the drop-off named. A bar's length compares dollars inside one class only.">
        <Card>
          <CardBody>
            {nothingYet ? (
              <div className="note">Nothing has entered the funnel. Findings appear at the top as the detectors fire.</div>
            ) : (
              <div className="rc-funnel">
                <FunnelBars stages={r.funnel} />
              </div>
            )}
          </CardBody>
        </Card>
      </Section>

      <Section title="Twelve conversion metrics" sub="Where opportunities die, measured as rates and delays. A blank is a metric with too little history to compute, not a zero.">
        <Card>
          <div className="tw rc-conv">
            <table className="t">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th className="rc-target">Target</th>
                  <th>Status</th>
                  <th>What it measures</th>
                </tr>
              </thead>
              <tbody>
                {r.conversions.map((m) => {
                  const v = metricValue(m);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.label}</div>
                        <div className="rc-def mono">{m.def}</div>
                      </td>
                      <td>
                        <div className="rc-value">
                          <span className="mono" style={{ fontWeight: 600 }}>
                            {v.text}
                          </span>
                          {v.ratio != null && <Meter value={v.ratio} tone={m.ok === false ? "est" : m.ok ? "book" : "neu"} label={`${m.label} ${v.text}`} />}
                          {m.value == null && <span className="xs">Not enough history</span>}
                        </div>
                      </td>
                      <td className="rc-target mono">{metricTarget(m)}</td>
                      <td>{m.ok == null ? <Pill tone="ghost">{m.target == null ? "No target" : "Not yet computable"}</Pill> : m.ok ? <Pill tone="book">On target</Pill> : <Pill tone="est">Off target</Pill>}</td>
                      <td className="small">
                        {m.measures}
                        <div className="xs" style={{ marginTop: 2 }}>
                          {m.bad}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Card style={{ marginTop: 20 }}>
        <CardHead title="How to read this screen" />
        <CardBody>
          <div className="note">The honest top of the funnel is qualified recoverable — the number a pipeline conversation should use. Exposure rises when detection improves; a falling number is not necessarily good news.</div>
        </CardBody>
      </Card>
    </div>
  );
}
