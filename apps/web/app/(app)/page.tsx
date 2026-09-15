import { HomeResponse, type InterventionSummary, type QueueCard } from "@streamline/contracts";
import { Button, Card, CardBody, CardHead, EmptyState, Pill, Section } from "@streamline/ui";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard } from "../../components/money-figure";
import { Sparkline } from "../../components/charts/sparkline";
import { classLabel, formatDate, formatPct, formatUsd, IV_STATE_LABEL, toneOfClass, toneOfOutcome, toneOfWord } from "../../lib/format";
import { withScope } from "../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../lib/server-api";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

const SEV: Record<QueueCard["type"], string> = { guardrail: "sev1", data_quality: "sev2", overlap: "sev2", verification_exception: "sev2", reversal: "sev3", missing_evidence: "sev3", action_due: "sev3", high_value: "sev4", window_eligible: "sev4", persistence: "sev2", recon_question: "sev3" };

function cardHref(c: QueueCard, scope: string | undefined): string {
  const base = c.ref.kind === "finding" ? `/findings/${c.ref.id}` : c.ref.kind === "intervention" ? `/changes/${c.ref.id}` : c.ref.kind === "action" ? `/actions#${c.ref.id}` : c.ref.kind === "feed" ? `/data#${c.ref.id}` : `/proof#${c.ref.id}`;
  return withScope(base, scope);
}

function QueueRow({ c, scope }: { c: QueueCard; scope: string | undefined }) {
  return (
    <div className={`qc ${SEV[c.type]}`}>
      <div>
        <div className="qc-over">
          {c.label} · {c.who}
        </div>
        <div className="qc-title">{c.title}</div>
        <div className="qc-body">{c.body}</div>
        {c.moneyCents != null && c.moneyClass && (
          <div className="qc-meta">
            <Pill tone={toneOfClass(c.moneyClass)}>
              {formatUsd(c.moneyCents)}/wk · {classLabel(c.moneyClass)}
            </Pill>
            {c.dueOn && <Pill tone={c.overdue ? "bad" : "ghost"}>{c.overdue ? "Overdue" : "Due"} {formatDate(c.dueOn)}</Pill>}
          </div>
        )}
      </div>
      <div className="qc-act">
        <Link href={cardHref(c, scope)}>
          <Button variant="secondary" size="sm">
            {c.act}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function ChangeRow({ iv, scope }: { iv: InterventionSummary; scope: string | undefined }) {
  return (
    <Link href={withScope(`/changes/${iv.id}`, scope)} className="card clickable" style={{ display: "block" }}>
      <div className="card-bd" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>{iv.title}</span>
          <span className="pills">
            <Pill tone={toneOfOutcome(iv.outcome)}>{iv.outcome === "pending" ? IV_STATE_LABEL[iv.state] : iv.outcomeLabel}</Pill>
            <Pill tone={toneOfWord(iv.confidenceWord)}>{iv.confidenceWord}</Pill>
          </span>
        </div>
        <div className="small">
          {iv.state === "measuring" ? (
            <>
              {iv.observed} of {iv.observedOf} comparable periods observed · result on {formatDate(iv.eligibleOn)} · projected <span className="mono tone-mod">{formatUsd(iv.projectedCents)}/wk</span> <Pill tone="mod">Projected</Pill>
            </>
          ) : iv.bookableCents != null ? (
            <>
              Bookable <span className="mono tone-book">{formatUsd(iv.bookableCents)}/wk</span> · realized to date <span className="mono tone-book">{formatUsd(iv.realizedCents)}</span>
              {iv.persistenceStatus === "decaying" ? " · decaying — an upkeep action is on the plan" : ""}
            </>
          ) : (
            <>
              Window closed {formatDate(iv.eligibleOn)} · {iv.outcomeLabel.toLowerCase()} · nothing counted
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const home = await serverApi(HomeResponse, `/api/v1/home${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const persistent = home.hero.persistent;
  const multiple = home.hero.multiple;
  const pv = persistent.value as { cents: number; klass: "bookable" };
  const K = Object.fromEntries(home.kpis.map((k) => [k.id, k]));
  const dq = home.dataConfidence;
  const staleFeeds = dq.feeds.filter((f) => f.stale);
  const empty = home.baseline && pv.cents === 0;
  const spark = home.loop.resultsLanded.length ? home.loop.resultsLanded.map((iv) => iv.realizedCents).reverse() : [];

  return (
    <div className="page">
      {empty ? (
        <section className="hero est">
          <div>
            <div className="hero-tail">Baselines are still accumulating.</div>
            <p className="hero-sub">
              {me.org.name} connected its register {home.baseline!.deliveredDays} days ago. Detectors need {home.baseline!.requiredDays} days of history before any control chart may fire, so there is nothing to decide, nothing in measurement, and nothing verified. That is the honest state of a new account; silence is the correct output.
            </p>
            <div className="hero-formal">
              <Pill tone="ghost">
                {home.baseline!.deliveredDays} of {home.baseline!.requiredDays} baseline days
              </Pill>
              <span>Feeds connected: {dq.feeds.filter((f) => f.newest).map((f) => f.name).join(", ") || "none"}</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <div className="kpi-label" id="hero-title">
              {persistent.label} · {home.period.label}
            </div>
            <div className="hero-fig mono">
              {formatUsd(pv.cents)}
              <span className="unit">still reaching the margin this period</span>
            </div>
            <div className="hero-tail">
              {(multiple.value as number).toFixed(2)}× what you pay us, on a fee prorated to the same period.
            </div>
            <p className="hero-sub">{persistent.read} Counts verified claims that passed their most recent persistence check, accrued over the days of this period they held. Work in flight is never counted; a reversal sits beside it, never inside it.</p>
            <div className="hero-formal">
              <Pill tone="book">{classLabel(pv.klass)}</Pill>
              <span className="term" title={persistent.definition}>
                {persistent.contract.lineage}
              </span>
              <span>calc {persistent.contract.calcVersion}</span>
            </div>
            <div className="hero-actions">
              <Link href={withScope("/proof", scope)}>
                <Button>See the proof</Button>
              </Link>
              <Link href={withScope("/today", scope)}>
                <Button variant="secondary">What needs me today</Button>
              </Link>
            </div>
          </div>
          <div className="hero-side">
            {spark.length > 1 ? <Sparkline values={spark} height={44} /> : null}
            <div className="big tone-book mono">{formatUsd((K.runrate?.value as { cents: number } | undefined)?.cents ?? 0)}</div>
            <div className="cap">{K.runrate?.label} — a run rate, not realized annual savings. The label is part of the metric.</div>
          </div>
        </section>
      )}

      <div className="grid-4" style={{ marginTop: 16 }}>
        {(["realized", "verified", "recoverable", "exposure"] as const).map((id) => (K[id] ? <KpiCard key={id} kpi={K[id]!} href={withScope(id === "realized" || id === "verified" ? "/proof" : "/findings", scope)} /> : null))}
      </div>

      <Section title="Needs you first" sub="Ranked by what it costs to ignore, not by size" right={<Link href={withScope("/today", scope)} className="small">All of today →</Link>}>
        {home.loop.decisionsDue.length ? (
          <div className="stack">
            {home.loop.decisionsDue.slice(0, 3).map((c) => (
              <QueueRow key={c.id} c={c} scope={scope} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<CheckCircle2 size={20} />} title="Nothing needs a decision today" description="Every guardrail held, every claim is inside its window, and no finding is waiting. That is what a quiet week looks like." />
        )}
      </Section>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <Section title="Executions due" sub="An action, not a dollar. The measurement clock starts at executed, never at approval.">
          {home.loop.executionsDue.length ? (
            <div className="stack">
              {home.loop.executionsDue.slice(0, 4).map((c) => (
                <QueueRow key={c.id} c={c} scope={scope} />
              ))}
            </div>
          ) : (
            <div className="note">No action is due. New ones appear when a finding is accepted.</div>
          )}
        </Section>
        <Section title="Tests running" sub="Windows open. Projected value is modelled and never added to verified savings.">
          {home.loop.testsRunning.length ? (
            <div className="stack">
              {home.loop.testsRunning.map((iv) => (
                <ChangeRow key={iv.id} iv={iv} scope={scope} />
              ))}
            </div>
          ) : (
            <div className="note">No window is open. Accept a finding, execute the action, and the clock starts.</div>
          )}
        </Section>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <Section title="Results landed" sub="Windows that closed in the last six weeks — wins and failures alike. A record that only shows wins is a brochure.">
          {home.loop.resultsLanded.length ? (
            <div className="stack">
              {home.loop.resultsLanded.map((iv) => (
                <ChangeRow key={iv.id} iv={iv} scope={scope} />
              ))}
            </div>
          ) : (
            <div className="note">No window has closed recently.</div>
          )}
        </Section>
        <Section title="Wins decaying" sub="Verified value below its persistence threshold. Upkeep, before the value disappears.">
          {home.loop.winsDecaying.length ? (
            <div className="stack">
              {home.loop.winsDecaying.map((iv) => (
                <ChangeRow key={iv.id} iv={iv} scope={scope} />
              ))}
            </div>
          ) : (
            <div className="note">Every verified claim is holding.</div>
          )}
        </Section>
      </div>

      <Section title="Data confidence" sub="When this falls, every number above it inherits the fall." right={<Link href={withScope("/data", scope)} className="small">Data →</Link>}>
        <Card>
          <CardHead
            title={
              <span>
                Composite {formatPct(dq.value, 0)} · {staleFeeds.length ? `${staleFeeds.length} feed${staleFeeds.length === 1 ? "" : "s"} stale` : "every pilot feed current"}
              </span>
            }
            sub="Freshness is read from the newest business date in the rows themselves, never from a stored health flag."
          />
          <CardBody>
            <div className="pills">
              {dq.feeds.map((f) => (
                <Pill key={f.id} tone={f.stale ? "bad" : f.newest ? "book" : "ghost"} title={f.newest ? `Newest business date ${f.newest} · ${Math.round(f.completeness * 1000) / 10}% complete` : "Not connected"}>
                  {f.name}
                  {f.stale ? ` · ${f.ageDays}d stale` : ""}
                </Pill>
              ))}
            </div>
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}
