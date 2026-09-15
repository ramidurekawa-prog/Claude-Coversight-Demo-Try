import { ApiRequestError, ChangeDetailResponse, type InterventionEval } from "@streamline/contracts";
import { Button, Card, CardBody, CardHead, GateRow, Kv, Pill, Section } from "@streamline/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditList } from "../../../../components/audit-list";
import { DidChart } from "../../../../components/charts/did-chart";
import { ConfBlock } from "../../../../components/conf-block";
import { FINDING_STATE_LABEL, formatDate, formatUsd, toneOfWord } from "../../../../lib/format";
import { withScope } from "../../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../../lib/server-api";
import { AdjustmentList, BridgeFigures, BridgeLinesTable, BridgeStatusNote, DidEstimateKv, GateRows, GuardrailRows, HistoryList, MintTable, PersistenceChart, PersistenceKv, ReconcileEstimateKv } from "../_lib/blocks";
import { autonomyLabel, FIDELITY_LABEL, HAPPY_PATH, isApprovedState, isHoldingState, isMeasuringState, leverLabel, outcomeTone, outcomeWord, pathPosition, roomLabel, rungLabel } from "../_lib/labels";

export const metadata: Metadata = { title: "Change" };
export const dynamic = "force-dynamic";

/** What happens next, by state: an act, a who, and the reason in one line. */
function NextStep({ iv }: { iv: InterventionEval }) {
  let act: string;
  let who: string;
  let why: string;
  if (isMeasuringState(iv.state)) {
    act = "Let the window close";
    who = "System";
    why = `Result on ${formatDate(iv.eligibleOn)}. ${iv.observed} of ${iv.observedOf} periods observed.`;
  } else if (isApprovedState(iv.state)) {
    act = "Execute the change";
    who = iv.owner;
    why = `Due ${formatDate(iv.execOn)}. The measurement clock starts at executed, never at approval.`;
  } else if (iv.state === "guardrail_failed") {
    act = "Approve the reversal plan";
    who = iv.approver;
    why = "Nothing was ever booked, so there is no credit implication.";
  } else if (iv.state === "decayed") {
    act = "Upkeep";
    who = iv.owner;
    why = "The value is decaying; an upkeep action is on the plan.";
  } else if (iv.state === "reversed") {
    act = "Withdrawn";
    who = "—";
    why = "Nothing further. The adjustment stays on the ledger beside the original row.";
  } else if (isHoldingState(iv.state)) {
    act = "Persistence check";
    who = "System";
    why = `${iv.persistence?.checks ?? 0} passed; next per the plan (${iv.plan.persistence}).`;
  } else {
    act = "Learning record";
    who = "System";
    why = "The prior for this lever updates; no claim.";
  }
  return (
    <div className="ch-next">
      <div className="ch-next-k">What happens next</div>
      <div>
        <span className="ch-next-act">{act}</span> <span className="ch-next-who">· {who}</span>
        <div className="small">{why}</div>
      </div>
    </div>
  );
}

function StateFlow({ iv }: { iv: InterventionEval }) {
  const pos = pathPosition(iv.state);
  const labels: Record<(typeof HAPPY_PATH)[number], string> = { draft: "Draft", approved: "Approved", executed: "Executed", measuring: "Measuring", verified: "Verified", persistent: "Persistent" };
  return (
    <div className="flow" aria-label="State path">
      {HAPPY_PATH.map((s, i) => {
        const cls = pos.fail || pos.closed ? (i <= pos.index ? "done" : "") : i < pos.index ? "done" : i === pos.index ? "now" : "";
        return (
          <span key={s} className="row" style={{ gap: 6 }}>
            {i > 0 && <span className="arrow">→</span>}
            <span className={`step ${cls}`}>{labels[s]}</span>
          </span>
        );
      })}
      {pos.fail && (
        <>
          <span className="arrow">→</span>
          <span className="step fail">{pos.fail}</span>
        </>
      )}
      {pos.closed && (
        <>
          <span className="arrow">→</span>
          <span className="step now">Closed</span>
        </>
      )}
    </div>
  );
}

export default async function ChangePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireSession()]);
  const scope = scopeParam(sp);
  let data: ChangeDetailResponse;
  try {
    data = await serverApi(ChangeDetailResponse, `/api/v1/changes/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
  const iv = data.intervention;
  const r = iv.result;
  const e = iv.estimate;
  const measuring = isMeasuringState(iv.state);
  const notExecuted = iv.executionFidelity === "not_started";
  const money = r.money;
  const whyTone = r.outcome === "guardrail_failure" || r.outcome === "negative" || r.outcome === "reversed" ? "note-bad" : r.outcome === "inconclusive" || r.outcome === "directional" || r.outcome === "data_failure" || r.outcome === "attribution_conflict" ? "note-mod" : "";
  const room = roomLabel(iv.loc, me.locations);
  const passedGr = iv.guardrailResults.filter((g) => g.passed).length;
  const showPacket = Boolean(money) || iv.state === "reversed";

  return (
    <div className="page">
      {/* a. header */}
      <div className="ch-head">
        <div className="pills">
          <Pill tone="ghost">
            {room}
            {iv.daypart ? ` ${iv.daypart}` : ""}
          </Pill>
          <Pill tone="ghost">{iv.domain}</Pill>
          <Pill tone="ghost">{leverLabel(iv.lever)}</Pill>
          <Pill tone={outcomeTone(iv)}>{outcomeWord(iv)}</Pill>
          <Pill tone={toneOfWord(data.confidenceWord)}>{data.confidenceWord}</Pill>
          <span className="mono xs">{iv.id}</span>
        </div>
        <h2 className="ch-title">{iv.title}</h2>
        <div className="ch-sub">
          <span className="mono">{iv.id}</span> · {notExecuted ? "not yet executed" : `executed ${formatDate(iv.execOn)}`} · {iv.plan.primary}
        </div>
      </div>

      {/* b. the house sentence */}
      <p className="plain">{data.outcomeSentence}</p>

      {/* c. what happens next */}
      <div style={{ marginTop: 14 }}>
        <NextStep iv={iv} />
      </div>

      {/* d. the money, or the verdict */}
      <div style={{ marginTop: 14 }}>
        {money && e ? (
          <Card accent="book">
            <CardHead title="Bookable — the conservative lower bound" sub="One class, one figure. The point estimate is shown beside it and never booked." />
            <CardBody>
              <div className="ch-money">
                <span className="ch-money-fig">
                  {formatUsd(money.cents)}
                  <span className="unit">/week</span>
                </span>
                <Pill tone="book">Bookable</Pill>
              </div>
              <div className="small">
                Point estimate <span className="mono">{formatUsd(e.point)}</span> · 90% interval <span className="mono">{formatUsd(e.ci[0])}</span> to <span className="mono">{formatUsd(e.ci[1])}</span> · booked at the lower end
              </div>
              {r.limitation && <div className="note note-est">Verified with a limitation: {r.limitation}</div>}
            </CardBody>
          </Card>
        ) : measuring ? (
          <div className="note">
            <span className="row" style={{ gap: 8, display: "inline-flex" }}>
              <span>
                Nothing is counted while the window is open. Projected <span className="mono tone-mod">{formatUsd(iv.projectedCents)}/wk</span> is modelled, not measured.
              </span>
              <Pill tone="mod">Projected</Pill>
            </span>
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className={`note ${whyTone}`}>{r.why}</div>
            <details className="ch-fold card">
              <summary>
                <span>
                  The formal verdict <span className="ch-fold-sub">{r.label}</span>
                </span>
              </summary>
              <div className="card-bd">
                <Kv
                  rows={[
                    { k: "Outcome", v: r.label },
                    { k: "Why", v: r.why },
                    ...(iv.state === "reversed" && iv.reversedClaimCents != null ? [{ k: "Claim withdrawn", v: `${formatUsd(iv.reversedClaimCents)}/wk, ${iv.weeksBooked} weeks restated`, mono: true }] : []),
                    ...(iv.reversal ? [{ k: "Found by", v: iv.reversal.foundBy }, { k: "Credit note", v: iv.reversal.creditNote }] : []),
                  ]}
                />
              </div>
            </details>
          </div>
        )}
      </div>

      {/* e. state */}
      <Section title="State" sub="Eighteen states, two forbidden edges. Every transition carries an actor, a business date and a reason.">
        <Card>
          <CardBody>
            <StateFlow iv={iv} />
            <div className="note">Two forbidden edges: approved → verified and executed → verified. Verified is writable only out of measuring, by the verification decision service.</div>
          </CardBody>
        </Card>
      </Section>

      {/* f + g. the change and its execution evidence */}
      <div className="grid-2" style={{ marginTop: 20 }}>
        <Section title="The change" sub="What was decided, by whom, and when the clock started.">
          <Card>
            <CardBody>
              <Kv
                rows={[
                  { k: "Hypothesis", v: iv.hypothesis },
                  { k: "Exact change", v: iv.change },
                  { k: "Deliberately not changing", v: iv.notChanging },
                  { k: "Owner", v: iv.owner },
                  { k: "Approver · tier", v: `${iv.approver} · ${iv.approvalTier}` },
                  { k: "Decided", v: formatDate(iv.decidedOn) },
                  { k: "Executed", v: notExecuted ? `due ${formatDate(iv.execOn)} — not yet executed` : `${formatDate(iv.execOn)} — the measurement clock starts here` },
                  { k: "Window closes", v: formatDate(iv.eligibleOn) },
                  { k: "Autonomy", v: autonomyLabel(iv.autonomy) },
                  { k: "Execution fidelity", v: FIDELITY_LABEL[iv.executionFidelity] },
                ]}
              />
            </CardBody>
          </Card>
        </Section>
        <Section title="Execution evidence" sub="Stage 7 of the loop: a hard precondition for measuring anything.">
          <Card>
            <CardBody>
              {iv.evidence.length ? (
                <div>
                  {iv.evidence.map((ev, i) => (
                    <GateRow key={i} status={ev.resolved ? "pass" : "pending"} label={ev.type} detail={ev.detail} />
                  ))}
                </div>
              ) : (
                <div className="note">No evidence attached yet.</div>
              )}
              <div className="note">{iv.dataQuality.detail}</div>
            </CardBody>
          </Card>
        </Section>
      </div>

      {/* h. the plan */}
      <Section title="The measurement plan — registered and frozen before execution" sub="Nothing here may change after the approval. The MDE and the threshold were fixed before the window opened.">
        <details className="ch-fold card" open>
          <summary>
            <span>
              {iv.plan.primary} <span className="ch-fold-sub">{iv.plan.windowDays}-day window · {rungLabel(iv.plan.rung)}</span>
            </span>
          </summary>
          <div className="card-bd">
            <Kv
              rows={[
                { k: "Primary metric", v: iv.plan.primary },
                { k: "Unit of analysis", v: iv.plan.unit },
                { k: "Baseline window", v: `${iv.plan.baselineDays} days` },
                { k: "Measurement window", v: `${iv.plan.windowDays} days` },
                { k: "Minimum / preferred observations", v: `${iv.plan.minObservations} / ${iv.plan.preferredObservations}` },
                { k: "Expected latency", v: `${iv.plan.latencyDays} days` },
                { k: "Comparison population", v: iv.plan.comparison },
                { k: "Attribution rung", v: rungLabel(iv.plan.rung) },
                { k: "MDE", v: e ? `${formatUsd(e.mde)}/wk` : "computed when the window closes", mono: Boolean(e) },
                { k: "Confidence threshold", v: iv.plan.z },
                { k: "Guardrails", v: iv.plan.guardrails.map((g) => g.replace(/_/g, " ")).join(", ") },
                { k: "Stop conditions", v: iv.plan.stop },
                { k: "Exclusions", v: iv.plan.exclusions },
                { k: "Persistence schedule", v: iv.plan.persistence },
                {
                  k: "Confounders",
                  v: (
                    <span className="pills">
                      {iv.plan.confounders.map((c) => (
                        <span key={c} className="chip">
                          {c}
                        </span>
                      ))}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </details>
      </Section>

      {/* i. the estimate */}
      <Section title="The estimate" sub={iv.estimator === "did" ? "Treated against its matched controls; the counterfactual is what the controls say would have happened anyway." : "Family A: the cost is observed directly and reconciled; the concurrent vendor index is disclosed."}>
        <Card>
          <CardBody>
            {measuring && <div className="note note-mod">The window is open — no estimate is shown until it closes. Peeking is how false wins get booked.</div>}
            {iv.series.treatment.length >= 4 && (iv.estimator === "did" || measuring) ? <DidChart treatment={iv.series.treatment} control={iv.series.control} execDate={iv.execOn} eligibleOn={iv.eligibleOn} unitLabel={iv.plan.unit} /> : null}
            {!measuring && iv.rawEstimate.ok && e ? (
              iv.estimator === "did" ? (
                <DidEstimateKv iv={iv} e={e} />
              ) : (
                <ReconcileEstimateKv e={e} />
              )
            ) : null}
            {!measuring && !iv.rawEstimate.ok ? <div className="note note-mod">No estimate: {iv.rawEstimate.reason}.</div> : null}
          </CardBody>
        </Card>
      </Section>

      {/* j + k. guardrails and gates */}
      <div className="grid-2" style={{ marginTop: 20 }}>
        <Section title="Guardrails — what was not allowed to get worse" sub={measuring ? "Read on the plan's schedule while the window is open." : `${passedGr} of ${iv.guardrailResults.length} inside their limits.`}>
          <Card>
            <CardBody>
              <GuardrailRows results={iv.guardrailResults} windowOpen={measuring} />
              <div className="note">No partial credit, no override path.</div>
            </CardBody>
          </Card>
        </Section>
        <Section title="The gates" sub={r.gateRun ? `${r.gateRun.gates.filter((g) => g.passed).length} of ${r.gateRun.gates.length} passed · ${r.gateRun.soft.length} soft` : "Every blocking gate must pass before the mint may run."}>
          <Card>
            <CardBody>
              {r.gateRun ? <GateRows gateRun={r.gateRun} /> : measuring ? <div className="note">The gates run once, when the window closes.</div> : r.outcome === "guardrail_failure" ? <div className="note note-bad">The verdict stopped at the guardrails. The gate run was never reached; there is nothing to mint.</div> : <div className="note">No gate run is recorded on this result.</div>}
            </CardBody>
          </Card>
        </Section>
      </div>

      {/* l. the mint */}
      {money && e && (
        <Section title="The mint — G8" sub="bookable = max(0, point − t·SE − incremental cost − unresolved overlap). The only door to a bookable dollar.">
          <Card accent="book">
            <CardBody>
              <MintTable iv={iv} estimate={e} bookableCents={money.cents} />
            </CardBody>
          </Card>
        </Section>
      )}

      {/* m. persistence */}
      {iv.persistence && (
        <Section title="Persistence — G12" sub="Exponential decay fit on the post-window weekly effect. Structural accrues 52 weeks; durable is re-verified quarterly; upkeep falls automatically.">
          <Card>
            <CardBody>
              <div className="grid-2">
                <PersistenceKv iv={iv} />
                <div className="stack" style={{ gap: 10 }}>
                  {money ? <PersistenceChart series={iv.persistenceSeries} verifiedCents={money.cents} /> : null}
                  <div className="ch-money-row">
                    <span className="mono tone-book">Realized to date {formatUsd(iv.realizedCents)}</span>
                    <Pill tone="book">Realized</Pill>
                  </div>
                  <div className="ch-money-row">
                    <span className="mono tone-book">Verified annualised run rate {formatUsd(iv.annualRunRateCents)}</span>
                    <Pill tone="book">Bookable</Pill>
                  </div>
                  <div className="xs">A run rate, not realized annual savings. The label is part of the metric. {iv.weeksHeld} weeks held.</div>
                </div>
              </div>
            </CardBody>
          </Card>
        </Section>
      )}

      {/* n. the bridge */}
      {data.bridge && (
        <Section title="The P&L bridge" sub="From the claim to the account it should move. Reconciliation is the accountant's view of whether any of this is real.">
          <Card>
            <CardBody>
              <BridgeFigures bridge={data.bridge} side={data.ledgerSide} />
              <BridgeStatusNote bridge={data.bridge} side={data.ledgerSide} />
              <details className="ch-fold">
                <summary>
                  <span>
                    The twelve lines of the bridge <span className="ch-fold-sub">{data.bridge.lines.length} lines</span>
                  </span>
                </summary>
                <div style={{ paddingTop: 8 }}>
                  <BridgeLinesTable bridge={data.bridge} />
                </div>
              </details>
            </CardBody>
          </Card>
        </Section>
      )}

      {/* o. adjustments */}
      {data.adjustments.length > 0 && (
        <Section title="Adjustments" sub="Shown beside the claim, never netted into it silently.">
          <Card>
            <CardBody>
              <AdjustmentList adjustments={data.adjustments} scope={scope} />
            </CardBody>
          </Card>
        </Section>
      )}

      {/* p. confidence */}
      <Section title="Confidence, in eight dimensions" sub="The word is derived from the dimensions; it never stands on its own.">
        <Card>
          <CardBody>
            <ConfBlock profile={data.confidence} word={data.confidenceWord} />
          </CardBody>
        </Card>
      </Section>

      {/* q. linked records */}
      <Section title="Linked records" sub="The finding this change came from and the actions that carry it.">
        <div className="ch-links">
          {data.finding ? (
            <Link href={withScope(`/findings/${data.finding.id}`, scope)} className="card clickable ch-link">
              <div className="xs">Finding · {FINDING_STATE_LABEL[data.finding.state] ?? data.finding.state}</div>
              <div className="ch-link-title">{data.finding.title}</div>
              <div className="small">
                recoverable <span className="mono tone-est">{formatUsd(data.finding.recoverableCents)}/wk</span> <Pill tone="est">Recoverable</Pill>
              </div>
            </Link>
          ) : (
            <div className="note">No finding is linked.</div>
          )}
          {data.actions.map((a) => (
            <Link key={a.id} href={withScope(`/actions#${a.id}`, scope)} className="card clickable ch-link">
              <div className="xs">
                Action <span className="mono">{a.id}</span> · {a.state.replace(/_/g, " ")}
              </div>
              <div className="ch-link-title">{a.title}</div>
              <div className="small">
                {a.owner} · due {formatDate(a.dueOn)}
                {a.doneOn ? ` · done ${formatDate(a.doneOn)}` : ""}
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* r. history */}
      <Section title="History" sub="Immutable. Every event carries who, when (business date) and why.">
        <details className="ch-fold card">
          <summary>
            <span>
              {data.audit.length || iv.history.length} events <span className="ch-fold-sub">{data.audit.length ? "audit log" : "declared history"}</span>
            </span>
          </summary>
          <div className="card-bd">{data.audit.length ? <AuditList events={data.audit} /> : <HistoryList history={iv.history} />}</div>
        </details>
      </Section>

      {/* s. footer */}
      <div className="ch-foot no-print">
        {showPacket && (
          <Link href={withScope(`/proof/${iv.id}/packet`, scope)}>
            <Button>Open the proof packet</Button>
          </Link>
        )}
        <Link href={withScope("/changes", scope)}>
          <Button variant="secondary">All changes</Button>
        </Link>
        <span className="xs" style={{ alignSelf: "center" }}>
          as of {formatDate(data.asOf)}
        </span>
      </div>
    </div>
  );
}
