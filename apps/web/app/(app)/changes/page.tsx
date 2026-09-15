import { ChangesResponse, type ApiLocation, type InterventionSummary } from "@streamline/contracts";
import { EmptyState, Pill, Section } from "@streamline/ui";
import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, formatUsd, IV_STATE_LABEL, toneOfOutcome, toneOfWord } from "../../../lib/format";
import { withScope } from "../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";
import { CHANGE_SECTIONS, isApprovedState, isMeasuringState, leverLabel, PERSISTENCE_STATUS_LABEL, roomLabel, sectionOf, type ChangeSectionKey } from "./_lib/labels";

export const metadata: Metadata = { title: "Changes" };
export const dynamic = "force-dynamic";

/** The money line of a row: one class per figure, labelled. Never a total. */
function MoneyLine({ iv }: { iv: InterventionSummary }) {
  if (isMeasuringState(iv.state)) {
    return (
      <div className="ch-row-money">
        <span className="mono tone-mod">projected {formatUsd(iv.projectedCents)}/wk</span>
        <Pill tone="mod">Projected</Pill>
        <span className="small">
          {iv.observed} of {iv.observedOf} periods · result on {formatDate(iv.eligibleOn)}
        </span>
      </div>
    );
  }
  if (isApprovedState(iv.state)) {
    return (
      <div className="ch-row-money">
        <span className="mono tone-mod">projected {formatUsd(iv.projectedCents)}/wk</span>
        <Pill tone="mod">Projected</Pill>
        <span className="small">
          execute by {formatDate(iv.execOn)} · {iv.owner}
        </span>
      </div>
    );
  }
  if (iv.reversed || iv.outcome === "reversed") {
    return (
      <div className="ch-row-money">
        <Pill tone="bad">Withdrawn</Pill>
        <span className="small">withdrawn — see the adjustment</span>
      </div>
    );
  }
  if (iv.bookableCents != null) {
    return (
      <div className="ch-row-money">
        <span className="mono tone-book">bookable {formatUsd(iv.bookableCents)}/wk</span>
        <Pill tone="book">Bookable</Pill>
        <span className="muted">·</span>
        <span className="mono tone-book">realized to date {formatUsd(iv.realizedCents)}</span>
        <Pill tone="book">Realized</Pill>
        <span className="muted">·</span>
        <span className="small">{iv.persistenceStatus ? `${PERSISTENCE_STATUS_LABEL[iv.persistenceStatus].toLowerCase()}${iv.persistenceStatus === "decaying" ? " — an upkeep action is on the plan" : ""}` : "persistence not yet assessed"}</span>
      </div>
    );
  }
  return (
    <div className="ch-row-money">
      <Pill tone="ghost">Nothing counted</Pill>
      <span className="small">window closed {formatDate(iv.eligibleOn)}</span>
    </div>
  );
}

function ChangeCard({ iv, scope, locations }: { iv: InterventionSummary; scope: string | undefined; locations: ApiLocation[] }) {
  return (
    <Link href={withScope(`/changes/${iv.id}`, scope)} className="card clickable ch-row">
      <div className="ch-row-top">
        <span className="ch-row-title">{iv.title}</span>
        <span className="pills">
          <Pill tone={toneOfOutcome(iv.outcome)}>{iv.outcome === "pending" ? IV_STATE_LABEL[iv.state] : iv.outcomeLabel}</Pill>
          <Pill tone={toneOfWord(iv.confidenceWord)}>{iv.confidenceWord}</Pill>
        </span>
      </div>
      <div className="xs">
        {roomLabel(iv.loc, locations)}
        {iv.daypart ? ` ${iv.daypart}` : ""} · {leverLabel(iv.lever)} · {iv.domain} · <span className="mono">{iv.id}</span>
      </div>
      <MoneyLine iv={iv} />
    </Link>
  );
}

export default async function ChangesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const data = await serverApi(ChangesResponse, `/api/v1/changes${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const groups = new Map<ChangeSectionKey, InterventionSummary[]>();
  for (const iv of data.interventions) {
    const key = sectionOf(iv);
    groups.set(key, [...(groups.get(key) ?? []), iv]);
  }
  const count = (k: ChangeSectionKey) => groups.get(k)?.length ?? 0;

  if (!data.interventions.length) {
    return (
      <div className="page">
        <div className="ch-head">
          <p className="plain">Work in flight is never counted. A record that only shows wins is a brochure.</p>
        </div>
        <EmptyState icon={<FlaskConical size={20} />} title="No change has been made yet" description={`${me.org.name} has not accepted a finding, so there is no measurement plan, no window and no result. The first change appears here the day its action is marked done.`} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="ch-head">
        <p className="plain">Work in flight is never counted. A record that only shows wins is a brochure.</p>
        <div className="pills">
          <Pill tone="ghost">{data.interventions.length} changes</Pill>
          {count("needs") > 0 && <Pill tone="bad">{count("needs")} need you</Pill>}
          {count("measuring") > 0 && <Pill tone="cau">{count("measuring")} measuring</Pill>}
          {count("holding") > 0 && <Pill tone="book">{count("holding")} verified and holding</Pill>}
          {count("closed") > 0 && <Pill tone="neu">{count("closed")} closed without a claim</Pill>}
          <span className="xs">as of {formatDate(data.asOf)}</span>
        </div>
      </div>

      {CHANGE_SECTIONS.map((s) => {
        const rows = groups.get(s.key) ?? [];
        if (!rows.length && !s.empty) return null;
        return (
          <Section key={s.key} title={s.title} sub={s.sub} right={rows.length ? <span className="xs">{rows.length}</span> : null}>
            {rows.length ? (
              <div className="stack">
                {rows.map((iv) => (
                  <ChangeCard key={iv.id} iv={iv} scope={scope} locations={me.locations} />
                ))}
              </div>
            ) : (
              <div className="note">{s.empty}</div>
            )}
          </Section>
        );
      })}
    </div>
  );
}
