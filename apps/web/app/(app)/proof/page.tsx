import { ProofResponse, type Kpi, type MoneyJson } from "@streamline/contracts";
import { Button, Card, CardBody, CardHead, EmptyState, Pill, Section } from "@streamline/ui";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccrualChart } from "../../../components/charts/accrual-chart";
import { KpiCard } from "../../../components/money-figure";
import { classLabel, formatDate, formatPct, formatUsd, toneOfOutcome, toneOfWord } from "../../../lib/format";
import { withScope } from "../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";
import { adjustmentTone, ReconPill } from "../changes/_lib/blocks";
import { PERSISTENCE_CLASS_LABEL, PERSISTENCE_STATUS_LABEL, reconLabel, roomLabel } from "../changes/_lib/labels";

export const metadata: Metadata = { title: "ROI proof" };
export const dynamic = "force-dynamic";

function Versions({ v }: { v: ProofResponse["versions"] }) {
  return (
    <div className="pf-versions xs">
      Calculation versions: engine {v.engine} · calc {v.calc} · fixture {v.fixture ?? "—"}
    </div>
  );
}

export default async function ProofPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const proof = await serverApi(ProofResponse, `/api/v1/proof${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const K = Object.fromEntries(proof.kpis.map((k) => [k.id, k])) as Record<string, Kpi | undefined>;
  const persistent = K.persistent;
  const multiple = K.multiple;
  const recon = K.recon;
  const pv = persistent?.value as MoneyJson | undefined;
  const feeLine = `${proof.period.label} · fee prorated to the period: ${formatUsd(proof.fee.periodCents)} of ${formatUsd(proof.fee.monthlyCents)}/month · ${proof.fee.note}`;

  if (!proof.ledger.length) {
    return (
      <div className="page">
        <EmptyState icon={<ScrollText size={20} />} title="Nothing has been verified yet" description={`Nothing has been verified yet — a claim needs a change to have been made and a window to have closed. ${me.org.name} has no claim on the ledger, so there is no realized value, no run rate and no bridge. That is the honest state, not a gap.`} />
        <div className="note" style={{ marginTop: 14 }}>
          {feeLine}
        </div>
        <Versions v={proof.versions} />
      </div>
    );
  }

  return (
    <div className="page">
      {persistent && pv && multiple ? (
        <section className="hero" aria-labelledby="proof-hero">
          <div>
            <div className="kpi-label" id="proof-hero">
              {persistent.label} · {proof.period.label}
            </div>
            <div className="hero-fig mono">
              {formatUsd(pv.cents)}
              <span className="unit">verified, and still holding</span>
            </div>
            <div className="hero-tail">{(multiple.value as number).toFixed(2)}× what you pay us</div>
            <p className="hero-sub">{feeLine}</p>
            <div className="hero-formal">
              <Pill tone="book">{classLabel(pv.klass)}</Pill>
              <span className="term" title={persistent.definition}>
                {persistent.contract.lineage}
              </span>
              <span>calc {persistent.contract.calcVersion}</span>
            </div>
          </div>
          {recon && typeof recon.value === "number" ? (
            <div className="hero-side">
              <div className="big mono">{formatPct(recon.value, 0)}</div>
              <div className="cap">{recon.label} — {recon.read}</div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid-4" style={{ marginTop: 16 }}>
        {(["realized", "runrate", "reconciledValue", "adjustments"] as const).map((id) => (K[id] ? <KpiCard key={id} kpi={K[id]!} href={id === "adjustments" ? "#adjustments" : id === "reconciledValue" ? "#bridges" : "#ledger"} /> : null))}
      </div>
      <div className="after">Four classes — realized, run rate, reconciled, adjustment. Shown beside each other, never added.</div>

      <Section title="Savings ledger" sub="Every verified or reversed claim. Nothing in flight, nothing projected." className="pf-anchor" right={<span className="xs">{proof.ledger.length} claims</span>}>
        <Card id="ledger">
          <div className="tw">
            <table className="t pf-ledger">
              <thead>
                <tr>
                  <th>Change</th>
                  <th>Room</th>
                  <th>Outcome</th>
                  <th className="r">Bookable /wk</th>
                  <th className="r">Realized to date</th>
                  <th>Persistence</th>
                  <th>Reconciliation</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {proof.ledger.map((iv) => (
                  <tr key={iv.id}>
                    <td>
                      <Link href={withScope(`/changes/${iv.id}`, scope)}>{iv.title}</Link>
                      <div className="xs mono">{iv.id}</div>
                    </td>
                    <td>{roomLabel(iv.loc, me.locations)}</td>
                    <td>
                      <Pill tone={toneOfOutcome(iv.outcome)}>{iv.outcomeLabel}</Pill>
                    </td>
                    <td className="r">{iv.reversed ? <Pill tone="bad">Withdrawn</Pill> : iv.bookableCents != null ? <span className="tone-book">{formatUsd(iv.bookableCents)}</span> : "—"}</td>
                    <td className="r">
                      <span className={iv.realizedCents ? "tone-book" : "muted"}>{formatUsd(iv.realizedCents)}</span>
                      {iv.reversed && <div className="xs">restated</div>}
                    </td>
                    <td>{iv.persistenceStatus ? `${PERSISTENCE_STATUS_LABEL[iv.persistenceStatus]}${iv.persistenceClass ? ` · ${PERSISTENCE_CLASS_LABEL[iv.persistenceClass].toLowerCase()}` : ""}` : "—"}</td>
                    <td>
                      <ReconPill status={iv.reconStatus} label={reconLabel(iv.reconStatus)} />
                    </td>
                    <td>
                      <Pill tone={toneOfWord(iv.confidenceWord)}>{iv.confidenceWord}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody>
            <div className="note">Bookable is the conservative lower bound net of cost and unresolved overlap. Reversed claims stay on the ledger with their adjustment beside them.</div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Realized accrual" sub="Value accrues daily from the day a claim becomes eligible, at the verified weekly rate, decayed by persistence class.">
        <Card>
          <CardBody>
            <div className="grid-3">
              <div className="tile tile-book">
                <div className="tile-label">Today</div>
                <div className="tile-value tone-book">{formatUsd(proof.accrual.todayCents)}</div>
                <div className="xs">Realized</div>
              </div>
              <div className="tile tile-book">
                <div className="tile-label">This week</div>
                <div className="tile-value tone-book">{formatUsd(proof.accrual.weekCents)}</div>
                <div className="xs">Realized</div>
              </div>
              <div className="tile tile-book">
                <div className="tile-label">{proof.period.label}</div>
                <div className="tile-value tone-book">{formatUsd(proof.accrual.monthCents)}</div>
                <div className="xs">Realized</div>
              </div>
            </div>
            <AccrualChart cumulative={proof.accrual.cumulative} byMonth={proof.accrual.byMonth} />
            <div className="note">Day = weekly ÷ 7 × persistence; month = sum of days, never × 4.33.</div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Adjustments" sub="Shown beside savings, never netted into them silently." className="pf-anchor">
        <Card id="adjustments">
          {proof.adjustments.length ? (
            <div className="tw">
              <table className="t">
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Kind</th>
                    <th>Change</th>
                    <th className="r">Amount</th>
                    <th>Status</th>
                    <th>On</th>
                    <th>By</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {proof.adjustments.map((a) => (
                    <tr key={a.id} id={a.id}>
                      <td className="mono">{a.id}</td>
                      <td>
                        <Pill tone={adjustmentTone(a.kind)}>{a.kind}</Pill>
                      </td>
                      <td>
                        <Link href={withScope(`/changes/${a.interventionId}`, scope)}>{a.title}</Link>
                        <div className="xs">{roomLabel(a.loc, me.locations)}</div>
                      </td>
                      <td className="r tone-bad">{formatUsd(a.cents, { sign: true })}</td>
                      <td>
                        {a.status}
                        {a.kind === "Dispute" && a.status === "open" && (
                          <div>
                            <Pill tone="est">blocks the fee on this claim</Pill>
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(a.on)}</td>
                      <td>{a.by}</td>
                      <td className="small" style={{ minWidth: 260 }}>
                        {a.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody>
              <div className="note">No adjustment this period. A reversal, a decay or a dispute would appear here beside the savings it touches.</div>
            </CardBody>
          )}
        </Card>
      </Section>

      <Section title={`P&L bridges — ${proof.closedPeriod.label}`} sub="For the last closed accounting period: from each claim to the account it should move, with the accountant's verdict." className="pf-anchor">
        <div id="bridges" className="grid-2">
          {proof.bridges.length ? (
            proof.bridges.map((b) => (
              <Card key={b.interventionId}>
                <CardHead
                  title={<Link href={withScope(`/changes/${b.interventionId}`, scope)}>{b.title}</Link>}
                  sub={
                    <span>
                      {b.bridge.account} · <span className="mono">{b.interventionId}</span>
                    </span>
                  }
                  right={<ReconPill status={b.bridge.status} label={b.bridge.statusLabel} />}
                />
                <CardBody>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span className="small">
                      Claim <span className="mono">{formatUsd(b.bridge.claimCents)}</span> · observed <span className="mono">{formatUsd(b.bridge.observedCents)}</span> · reconciled <span className="mono tone-book">{formatUsd(b.bridge.reconciledCents)}</span>
                    </span>
                  </div>
                  <details className="ch-fold">
                    <summary>
                      <span>
                        The bridge lines <span className="ch-fold-sub">{b.bridge.lines.length} lines</span>
                      </span>
                    </summary>
                    <div className="tw" style={{ paddingTop: 8 }}>
                      <table className="t dense">
                        <tbody>
                          {b.bridge.lines.map((l, i) => (
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
                  </details>
                  <div>
                    <Link href={withScope(`/proof/${b.interventionId}/packet`, scope)}>
                      <Button variant="secondary" size="sm">
                        Open the packet
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            ))
          ) : (
            <div className="note">No claim was eligible for a bridge in {proof.closedPeriod.label}.</div>
          )}
        </div>
      </Section>

      <Versions v={proof.versions} />
    </div>
  );
}
