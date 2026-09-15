import { ApiRequestError, ProofPacketResponse } from "@streamline/contracts";
import { Button, Kv, Pill } from "@streamline/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditList } from "../../../../../components/audit-list";
import { ConfBlock } from "../../../../../components/conf-block";
import { formatDate, formatDateYear, formatUsd, toneOfWord } from "../../../../../lib/format";
import { withScope } from "../../../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../../../lib/server-api";
import { AdjustmentList, BridgeLinesTable, BridgeStatusNote, HistoryList, ReconPill } from "../../../changes/_lib/blocks";
import { estimatorLabel, feedLabel, FIDELITY_LABEL, outcomeTone, outcomeWord, PERSISTENCE_CLASS_LABEL, PERSISTENCE_STATUS_LABEL, roomLabel } from "../../../changes/_lib/labels";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Proof packet" };
export const dynamic = "force-dynamic";

const two = (n: number) => n.toFixed(2);

export default async function PacketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireSession()]);
  const scope = scopeParam(sp);
  let p: ProofPacketResponse;
  try {
    p = await serverApi(ProofPacketResponse, `/api/v1/proof/${encodeURIComponent(id)}/packet`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
  const iv = p.intervention;
  const r = iv.result;
  const e = iv.estimate;
  const money = r.money;
  const reversed = iv.state === "reversed" || r.outcome === "reversed";
  const passedGr = iv.guardrailResults.filter((g) => g.passed).length;
  const evidenceN = iv.evidence.filter((x) => x.resolved).length;
  const sources = p.finding?.feeds?.length ? p.finding.feeds.map(feedLabel).join(", ") : "per the measurement plan";
  const cost = iv.incrementalCostCents ?? 0;
  const overlap = iv.overlapDeductionCents ?? 0;

  return (
    <div className="page">
      <article className="card pf-packet">
        <header className="pf-seal">
          <div className="pills">
            <span className={`pf-seal-word tone-${outcomeTone(iv)}`}>{outcomeWord(iv)}</span>
            <span className="muted">·</span>
            <span className="pf-org">{p.org.name}</span>
            {p.org.synthetic && <Pill tone="est">Synthetic data</Pill>}
          </div>
          <div className="xs">
            Proof packet · <span className="mono">{iv.id}</span> · generated {formatDateYear(p.generatedOn)}
          </div>
        </header>

        <h2 className="ch-title" style={{ marginTop: 16 }}>
          {iv.title}
        </h2>
        <div className="ch-sub">
          {roomLabel(iv.loc, me.locations)}
          {iv.daypart ? ` ${iv.daypart}` : ""} · {iv.plan.primary} · executed {formatDateYear(iv.execOn)}
        </div>

        {money ? (
          <div className="ch-money" style={{ marginTop: 14 }}>
            <span className="pf-fig">
              {formatUsd(money.cents)}
              <span className="unit">/wk</span>
            </span>
            <Pill tone="book">Bookable</Pill>
          </div>
        ) : reversed ? (
          <div className="ch-money" style={{ marginTop: 14 }}>
            <span className="pf-fig bad">Withdrawn</span>
            <Pill tone="bad">Reversed</Pill>
          </div>
        ) : (
          <div className="ch-money" style={{ marginTop: 14 }}>
            <span className="pf-fig neu">No claim</span>
            <Pill tone={outcomeTone(iv)}>{r.label}</Pill>
          </div>
        )}
        <p className="plain" style={{ marginTop: 10 }}>
          {p.outcomeSentence}
        </p>

        <h3 className="pf-h">The claim</h3>
        <Kv
          rows={[
            { k: "Verdict", v: r.label },
            { k: "Conservative amount", v: money ? `${formatUsd(money.cents)}/wk — bookable, the lower bound` : reversed && iv.reversedClaimCents != null ? `withdrawn — ${formatUsd(iv.reversedClaimCents)}/wk was verified, then reversed after ${iv.weeksBooked} weeks` : "none", mono: true },
            { k: "Point estimate", v: e ? `${formatUsd(e.point)}/wk` : "—", mono: true },
            { k: "90% interval", v: e ? `${formatUsd(e.ci[0])} to ${formatUsd(e.ci[1])}` : "—", mono: true },
            { k: "Measurement period", v: `${formatDateYear(iv.execOn)} → ${formatDateYear(iv.eligibleOn)} (${iv.plan.windowDays} days after a ${iv.plan.baselineDays}-day baseline)` },
            { k: "Sample", v: e ? `treated ${e.n.Tpre} before, ${e.n.Tpost} after · control ${e.n.Cpre} before, ${e.n.Cpost} after · ${iv.plan.unit}` : "—", mono: true },
            { k: "Comparison method", v: `${iv.plan.comparison} · ${estimatorLabel(iv.estimator)}` },
            { k: "Execution confirmed", v: `${FIDELITY_LABEL[iv.executionFidelity]} · ${evidenceN} of ${iv.evidence.length} evidence items resolved` },
            { k: "Guardrails", v: `${passedGr} of ${iv.guardrailResults.length} inside their limits` },
            { k: "Persistence", v: iv.persistence ? `${iv.persistence.cls ? PERSISTENCE_CLASS_LABEL[iv.persistence.cls] : "unclassed"} · ${PERSISTENCE_STATUS_LABEL[iv.persistence.status]} · ${iv.persistence.checks} checks passed` : "not yet assessed" },
            { k: "Reconciliation", v: p.bridge ? <ReconPill status={p.bridge.status} label={p.bridge.statusLabel} /> : "not yet bridged" },
            { k: "Sources", v: sources },
            { k: "Calculation version", v: `calc ${p.versions.calc} · engine ${p.versions.engine} · fixture ${p.versions.fixture ?? "—"}` },
          ]}
        />

        {e && (
          <>
            <h3 className="pf-h">How the number was reached</h3>
            <div className="tw">
              <table className="t ch-mint dense">
                <tbody>
                  <tr>
                    <td>Observed change, scaled to the week</td>
                    <td className="r">{formatUsd(e.point)}/wk</td>
                  </tr>
                  <tr>
                    <td>less t × SE</td>
                    <td className="r">
                      t {two(e.tcrit)} × {formatUsd(e.se)}
                    </td>
                  </tr>
                  <tr>
                    <td>= lower bound</td>
                    <td className="r">{formatUsd(e.lower)}/wk</td>
                  </tr>
                  <tr>
                    <td>less incremental cost and unresolved overlap</td>
                    <td className="r">
                      {cost ? `${formatUsd(cost)} one-time, amortised across 52 weeks` : "no cost"} · {overlap ? formatUsd(overlap) : "no overlap"}
                    </td>
                  </tr>
                  <tr className="tot">
                    <td>{money ? "Booked" : reversed ? "Booked, then withdrawn" : "Not booked"}</td>
                    <td className={`r ${money ? "tone-book" : reversed ? "tone-bad" : "muted"}`}>{money ? `${formatUsd(money.cents)}/wk` : reversed && iv.reversedClaimCents != null ? formatUsd(iv.reversedClaimCents) + "/wk" : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 className="pf-h">Assumptions this rests on</h3>
        <ul className="pf-assume">
          <li>Parallel trends held in the pre-period{e ? ` (placebo t = ${two(e.placebo.t)} against ${two(e.placebo.crit)}, ${e.placebo.pass ? "passed" : "failed"})` : ""}.</li>
          <li>The comparison rooms did not change: {iv.plan.comparison.toLowerCase()}.</li>
          <li>Execution was as recorded: {FIDELITY_LABEL[iv.executionFidelity].toLowerCase()}.</li>
          <li>The register is complete above 90% for every feed in the window: {iv.dataQuality.detail.toLowerCase()}</li>
        </ul>

        <h3 className="pf-h">Confidence, in eight dimensions</h3>
        <ConfBlock profile={p.confidence} word={p.confidenceWord} />

        {p.bridge && (
          <>
            <h3 className="pf-h">The P&L bridge</h3>
            <BridgeLinesTable bridge={p.bridge} />
            <div style={{ marginTop: 8 }}>
              <BridgeStatusNote bridge={p.bridge} side={p.ledgerSide} />
            </div>
          </>
        )}

        {p.adjustments.length > 0 && (
          <>
            <h3 className="pf-h">Adjustments</h3>
            <AdjustmentList adjustments={p.adjustments} scope={scope} />
          </>
        )}

        <h3 className="pf-h">History</h3>
        {p.audit.length ? <AuditList events={p.audit} /> : <HistoryList history={iv.history} />}

        <footer className="pf-foot">
          <div>
            Sample output from synthetic data. Not an audited document. Confidence word: <Pill tone={toneOfWord(p.confidenceWord)}>{p.confidenceWord}</Pill> · window {formatDate(iv.execOn)} → {formatDate(iv.eligibleOn)}
          </div>
          <div className="ch-foot no-print" style={{ marginTop: 12 }}>
            <PrintButton />
            <Link href={withScope(`/changes/${iv.id}`, scope)}>
              <Button variant="secondary">Open the full record</Button>
            </Link>
            <Link href={withScope("/proof", scope)}>
              <Button variant="ghost">ROI proof</Button>
            </Link>
          </div>
        </footer>
      </article>
    </div>
  );
}
