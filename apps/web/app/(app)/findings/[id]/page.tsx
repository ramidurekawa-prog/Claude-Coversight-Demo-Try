import { ApiRequestError, FindingDetailResponse } from "@streamline/contracts";
import { Card, CardBody, GateRow, Kv, Pill, Section } from "@streamline/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuditList } from "../../../../components/audit-list";
import { ControlChart } from "../../../../components/charts/control-chart";
import { ConfBlock } from "../../../../components/conf-block";
import { daysLeft, FINDING_STATE_LABEL, formatDate, formatPct, formatUsd, IV_STATE_LABEL, toneOfWord } from "../../../../lib/format";
import { withScope } from "../../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../../lib/server-api";
import { autonomyLabel, formatObserved, guardrailLabel, leverLabel, roomGm, roomName, stateTone } from "../labels";
import { DecidePanel } from "./decide-panel";

export const metadata: Metadata = { title: "Finding" };
export const dynamic = "force-dynamic";

/** A section that folds: open by default unless `closed`. Content stays in the DOM either way. */
function Fold({ title, sub, closed, children }: { title: ReactNode; sub?: ReactNode; closed?: boolean; children: ReactNode }) {
  return (
    <details className="sect fd-fold" open={!closed}>
      <summary>
        <div className="sect-head">
          <div>
            <h2 className="sect-title">{title}</h2>
            {sub && <div className="sect-sub">{sub}</div>}
          </div>
        </div>
      </summary>
      {children}
    </details>
  );
}

export default async function FindingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireSession()]);
  const scope = scopeParam(sp);
  let res: FindingDetailResponse;
  try {
    res = await serverApi(FindingDetailResponse, `/api/v1/findings/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
  const f = res.finding;
  const o = f.observed;
  const room = roomName(f.loc, me.locations);
  const open = f.state === "awaiting_decision";
  const left = daysLeft(res.asOf, f.expiresOn);
  const riskTone = f.remedy.risk === "low" ? "book" : f.remedy.risk === "medium" ? "est" : "bad";
  const reasonTone = f.state === "rejected" || f.state === "expired" || f.state === "data_insufficient" || f.state === "invalidated" ? "note-bad" : f.state === "investigating" ? "note-mod" : "";
  const iv = res.intervention;

  return (
    <div className="page">
      <nav className="xs" aria-label="Breadcrumb">
        <Link href={withScope("/findings", scope)}>Findings</Link> <span aria-hidden="true">›</span> <span className="mono">{f.id}</span>
      </nav>

      {/* a. pills, title, plain sentence, state reason */}
      <header className="fd-top" style={{ marginTop: 10 }}>
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div className="pills">
            <Pill tone="neu">{room}</Pill>
            <Pill tone="neu">{f.domain}</Pill>
            <Pill tone={stateTone(f.state)}>{FINDING_STATE_LABEL[f.state] ?? f.state}</Pill>
            {f.daypart && <Pill tone="ghost">{f.daypart}</Pill>}
            <Pill tone={toneOfWord(res.confidenceWord)} title="Expands to the eight dimensions below">
              {res.confidenceWord}
            </Pill>
            <span className="xs mono">{f.id}</span>
          </div>
          <h1 className="fd-title">{f.title}</h1>
          <p className="plain" style={{ marginTop: 10, maxWidth: "70ch" }}>
            {f.plain}
          </p>
        </div>
        {open && (
          <div className="fd-topright">
            <Pill tone={left < 7 ? "bad" : "est"}>
              Decide by {formatDate(f.expiresOn)} · {left} days
            </Pill>
            <a className="xs" href="#decide">
              Decide ↓
            </a>
          </div>
        )}
      </header>
      {f.stateReason && <div className={`note ${reasonTone}`} style={{ marginTop: 12 }}>{f.stateReason}</div>}

      {/* b. the money */}
      <Section title="The money" sub="Two estimates, one class each. Neither is a saving; neither is annualised.">
        <div className="fd-money">
          <div className="tile tile-est">
            <div className="tile-label">Profit exposure</div>
            <div className="tile-value tone-est">
              {formatUsd(f.exposureCents)}
              <span className="fd-unit">/wk</span>
            </div>
            <div>
              <Pill tone="est">Estimated · never a total</Pill>
            </div>
          </div>
          <div className="tile tile-est">
            <div className="tile-label">Qualified recoverable</div>
            <div className="tile-value tone-est">
              {formatUsd(f.recoverableCents)}
              <span className="fd-unit">/wk</span>
            </div>
            <div className="pills">
              <Pill tone="est">Estimated · after recoverability and overlap</Pill>
              {f.projectedLowCents != null && f.projectedHighCents != null && (
                <span className="xs mono">
                  range {formatUsd(f.projectedLowCents)}–{formatUsd(f.projectedHighCents)}/wk
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          Recoverable = exposure × the lever&apos;s recovery factor − overlap deduction ({formatUsd(f.overlapDeductionCents)}). Neither figure may be called a saving, and neither may be annualised.
        </div>
      </Section>

      {/* c. the loss as observed */}
      <Section title="The loss, as observed" sub="What the register shows against this room's own history.">
        <Card>
          <CardBody>
            <Kv
              rows={[
                { k: "Metric", v: o.metric },
                { k: "Actual", v: <span className="mono tone-bad">{formatObserved(o.actual, o.unit)}</span> },
                { k: "Baseline expectation", v: <span className="mono">{formatObserved(o.baseline, o.unit)}</span> },
                { k: "Period observed", v: o.periodLabel },
                {
                  k: "Drift started",
                  v: f.onset ? (
                    <>
                      {formatDate(f.onset.onsetDate)} — named by the change-point, not the day the chart crossed; signalled {formatDate(f.onset.signalDate)}
                    </>
                  ) : (
                    "—"
                  ),
                },
                { k: "Evidence", v: f.evidenceCount > 0 ? `${f.evidenceCount} observations at a ${f.cadenceDays}-day cadence` : "—" },
              ]}
            />
          </CardBody>
        </Card>
      </Section>

      {/* d. the control chart */}
      <Section title="The control chart that fired" sub="EWMA/CUSUM with a stated false-alarm rate (about 1 in 500 observations). Repeat floors are not used.">
        <Card>
          <CardBody>
            {f.series.length > 3 ? (
              <ControlChart series={f.series} baselineN={f.chartBaselineN} onset={f.onset} unit={o.unit} title={`${o.metric} — ${room}${f.daypart ? `, ${f.daypart}` : ""}`} />
            ) : f.historical ? (
              <div className="note">No series is recorded for this historical finding.</div>
            ) : (
              <div className="note">This detector compares two periods rather than charting a series.</div>
            )}
          </CardBody>
        </Card>
      </Section>

      {/* e. causes */}
      <Fold title="The cause — ranked, with what would separate them" sub="Weights are a diagnostic ranking, not probabilities.">
        <Card>
          {f.causes.length ? (
            <div className="tw fd-causes">
              <table className="t">
                <thead>
                  <tr>
                    <th>Likely cause</th>
                    <th className="r">Weight</th>
                    <th>Evidence that would separate it</th>
                  </tr>
                </thead>
                <tbody>
                  {f.causes.map((c) => (
                    <tr key={c.cause}>
                      <td style={{ fontWeight: 600 }}>{c.cause}</td>
                      <td className="r">{formatPct(c.p, 0)}</td>
                      <td className="small">{c.sep}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody>
              <div className="note">No ranked causes were recorded for this finding.</div>
            </CardBody>
          )}
        </Card>
        <p className="after">Weights are a diagnostic ranking, not probabilities. The right-hand column is the query that would settle it.</p>
      </Fold>

      {/* f. remedy */}
      <Section title="The remedy" sub="The change we would make, and what it costs to make it.">
        <Card accent="brand">
          <CardBody>
            <Kv
              rows={[
                { k: "Recommended change", v: <span style={{ fontWeight: 600 }}>{f.remedy.change}</span> },
                { k: "The artefact", v: f.remedy.artifact },
                {
                  k: "Alternatives considered",
                  v: f.remedy.alternatives.length ? (
                    <ul className="fd-list">
                      {f.remedy.alternatives.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : (
                    "None recorded"
                  ),
                },
                { k: "Operator effort", v: `${f.remedy.effort}h` },
                {
                  k: "Operational risk",
                  v: (
                    <Pill tone={riskTone}>
                      {f.remedy.risk} risk
                    </Pill>
                  ),
                },
                { k: "Time to effect", v: `${f.remedy.latencyDays} days` },
                { k: "Autonomy available", v: autonomyLabel(f.autonomy) },
              ]}
            />
          </CardBody>
        </Card>
      </Section>

      {/* g. limits */}
      <Section title="The limits" sub="What we would watch, what would stop us, and who else is claiming these dollars.">
        <Card>
          <CardBody>
            <Kv
              rows={[
                {
                  k: "Guardrails",
                  v: f.guardrails.length ? (
                    <span className="pills">
                      {f.guardrails.map((g) => (
                        <span key={g} className="chip">
                          {guardrailLabel(g)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "None recorded"
                  ),
                },
                {
                  k: "Contraindications",
                  v: f.contraindications.length ? (
                    <ul className="fd-list">
                      {f.contraindications.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    "None recorded"
                  ),
                },
                {
                  k: "Overlap",
                  v:
                    f.overlapStatus === "none" ? (
                      "No open or verified claim shares this scope, period and account."
                    ) : (
                      <div className={`note ${f.overlapStatus === "unresolved" ? "note-bad" : "note-est"}`}>
                        <div style={{ fontWeight: 600 }}>
                          {f.overlapStatus === "reduced" ? `Reduced by ${formatUsd(f.overlapDeductionCents)}/wk` : f.overlapStatus === "holds" ? "Holds — this claim keeps its full figure" : "Unresolved — both claims are blocked until it is allocated"}
                          {f.overlapRefs[0]?.rule ? ` · rule ${f.overlapRefs[0].rule}` : ""}
                        </div>
                        {f.overlapNote && <div style={{ marginTop: 4 }}>{f.overlapNote}</div>}
                        {res.overlapWith.length > 0 && (
                          <ul className="fd-list" style={{ marginTop: 6 }}>
                            {res.overlapWith.map((w) => (
                              <li key={w.id}>
                                <Link href={withScope(`/findings/${w.id}`, scope)}>{w.title}</Link> · <span className="mono">{formatUsd(w.recoverableCents)}/wk</span> · {FINDING_STATE_LABEL[w.state] ?? w.state}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ),
                },
              ]}
            />
          </CardBody>
        </Card>
      </Section>

      {/* h. qualification */}
      <Section title="Qualification" sub="Four tests before a finding may ask for a decision.">
        <Card>
          <CardBody style={{ gap: 0 }}>
            {f.qualification.tests.length ? f.qualification.tests.map((t) => <GateRow key={t.id} status={t.pass ? "pass" : "fail"} label={t.label} detail={t.detail} />) : null}
            {f.historical && <div className="note" style={{ marginTop: f.qualification.tests.length ? 10 : 0 }}>Historical finding — qualification records predate the current contract.</div>}
            {!f.historical && f.qualification.staleFeeds.length > 0 && <div className="note note-bad" style={{ marginTop: 10 }}>Stale feeds: {f.qualification.staleFeeds.join(", ")}</div>}
          </CardBody>
        </Card>
      </Section>

      {/* i. confidence */}
      <Section title="Confidence, in eight dimensions" sub="The word above is derived from these; it never stands alone.">
        <Card>
          <CardBody>
            <ConfBlock profile={res.confidence} word={res.confidenceWord} />
          </CardBody>
        </Card>
      </Section>

      {/* j. bookkeeping */}
      <Fold title="The bookkeeping" sub="Detector, equations, feeds, account, scope and dates." closed>
        <Card>
          <CardBody>
            <Kv
              rows={[
                { k: "Detector", v: f.detector },
                { k: "Lever", v: `${leverLabel(f.lever)} · family ${f.family}` },
                {
                  k: "Equations",
                  v: f.equations.length ? (
                    <span className="pills">
                      {f.equations.map((e) => (
                        <span key={e} className="chip mono">
                          {e}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "—"
                  ),
                },
                {
                  k: "Feeds cited",
                  v: (
                    <span className="pills">
                      {f.feeds.map((x) => (
                        <span key={x} className="chip">
                          {x}
                        </span>
                      ))}
                    </span>
                  ),
                },
                { k: "Account", v: f.account },
                { k: "Scope key", v: f.scopeKey, mono: true },
                { k: "Detected", v: formatDate(f.detectedOn) },
                { k: "Decision window opened", v: formatDate(f.decisionOpenedOn) },
                { k: "Expires", v: formatDate(f.expiresOn) },
                { k: "Effort hours", v: `${f.effortHours}h` },
                { k: "EV per hour", v: <span className="mono">{formatUsd(f.evPerHour)}/h</span> },
              ]}
            />
          </CardBody>
        </Card>
      </Fold>

      {/* k. rejection / conversion */}
      {f.rejection && (
        <div className="note note-est" style={{ marginTop: 20 }}>
          Declined by {f.rejection.by} on {formatDate(f.rejection.on)} — {f.rejection.code.replace(/_/g, " ")}: {f.rejection.reason}
        </div>
      )}
      {f.convertedTo && iv && (
        <div className="note note-ok" style={{ marginTop: 20 }}>
          Converted to{" "}
          <Link href={withScope(`/changes/${iv.id}`, scope)} style={{ fontWeight: 600 }}>
            {iv.id} — {iv.title}
          </Link>{" "}
          · {IV_STATE_LABEL[iv.state] ?? iv.state}
        </div>
      )}

      {/* l. history */}
      <Section title="History" sub="Every transition with its actor, business date and reason.">
        <Card>
          <CardBody>
            <AuditList events={res.audit} />
          </CardBody>
        </Card>
      </Section>

      {/* m. decide */}
      <DecidePanel id={f.id} asOf={res.asOf} state={f.state} allowedTransitions={res.allowedTransitions} proposal={res.proposal} roomGm={roomGm(f.loc, me.locations)} scope={scope} />
    </div>
  );
}
