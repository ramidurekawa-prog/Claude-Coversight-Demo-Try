import { DataResponse, type FeedHealth, type FeedRisk, type MeResponse } from "@streamline/contracts";
import { buttonVariants, Card, CardBody, CardHead, Kv, Meter, Note, Pill, Section } from "@streamline/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, formatDateYear, formatPct, formatUsd, type Tone } from "../../../lib/format";
import { withScope } from "../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Data" };
export const dynamic = "force-dynamic";

const count = new Intl.NumberFormat("en-US");
const TIER_TONE: Record<FeedHealth["tier"], Tone> = { Pilot: "book", Next: "mod", Later: "ghost" };
const TIER_ORDER: Record<FeedHealth["tier"], number> = { Pilot: 0, Next: 1, Later: 2 };

/** Stale feeds first, then by tier, then the server's order. Ordering only; nothing is computed. */
function orderFeeds(feeds: FeedHealth[]): FeedHealth[] {
  return feeds
    .map((f, i) => ({ f, i }))
    .sort((a, b) => Number(b.f.stale) - Number(a.f.stale) || TIER_ORDER[a.f.tier] - TIER_ORDER[b.f.tier] || a.i - b.i)
    .map((x) => x.f);
}

/** The four dollars a feed carries, each in its own class. They are never summed. */
const RISK: ReadonlyArray<{ key: keyof Omit<FeedRisk, "feedId">; label: string; klass: string; tone: Tone }> = [
  { key: "openExposureCents", label: "Open findings that read this feed", klass: "Estimated", tone: "est" },
  { key: "monitoringCents", label: "Changes measuring against it", klass: "Modelled", tone: "mod" },
  { key: "verifiedAtRiskCents", label: "Verified claims that stop accruing without it", klass: "Bookable", tone: "book" },
  { key: "blockedCents", label: "Blocked until it refreshes", klass: "Estimated", tone: "est" },
];

function roomOf(loc: string, me: MeResponse): string {
  if (loc === "group") return "All rooms";
  return me.locations.find((l) => l.code === loc)?.short ?? loc;
}

function FeedCard({ f, risk }: { f: FeedHealth; risk: FeedRisk | undefined }) {
  const connected = f.newest !== null;
  const compTone: "est" | "book" = f.completeness < 0.9 ? "est" : "book";
  return (
    <Card id={f.id} accent={f.stale ? "bad" : connected ? "book" : "neu"} className="dq-feed">
      <CardHead title={f.name} sub={[f.access, f.cadence].filter((x) => x && x !== "—").join(" · ") || undefined} right={<Pill tone={TIER_TONE[f.tier]}>{f.tier}</Pill>} />
      <CardBody>
        <div className="dq-fresh">
          {!connected ? (
            <Pill tone="ghost">Not connected</Pill>
          ) : f.stale ? (
            <Pill tone="bad">
              {f.ageDays}d stale{f.slaHours != null ? ` against a ${f.slaHours}h rule` : ""}
            </Pill>
          ) : (
            <Pill tone="book">Current</Pill>
          )}
          <span className="small">
            {connected ? (
              <>
                Newest business date {formatDate(f.newest)} · {f.ageDays} {f.ageDays === 1 ? "day" : "days"} old
              </>
            ) : (
              "No business date has been delivered."
            )}
          </span>
        </div>
        <div className="dq-comp">
          <span className="xs">Completeness</span>
          <Meter value={f.completeness} tone={compTone} label={`${f.name} completeness ${formatPct(f.completeness, 1)}`} />
          <span className={`mono small tone-${compTone}`}>{formatPct(f.completeness, 1)}</span>
        </div>
        <Kv
          rows={[
            { k: "Rows delivered", v: count.format(f.rows), mono: true },
            { k: "Fields", v: f.fields },
            { k: "Feeds stages", v: f.stages },
          ]}
        />
        <details className="dq-blocks">
          <summary>What this blocks</summary>
          <div className="dq-blocks-body">
            <p className="small">{f.degraded}</p>
            {risk ? (
              <div className="dq-risk">
                {RISK.map((r) => (
                  <div key={r.key} className="dq-risk-row">
                    <span className="small">{r.label}</span>
                    <span className={`mono ${risk[r.key] ? `tone-${r.tone}` : "muted"}`}>{formatUsd(risk[r.key])}/wk</span>
                    <Pill tone={r.tone}>{r.klass}</Pill>
                  </div>
                ))}
                <div className="xs" style={{ marginTop: 6 }}>
                  Four numbers in four classes, apportioned across the feeds each record reads. They are never added together.
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </CardBody>
    </Card>
  );
}

export default async function DataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const data = await serverApi(DataResponse, `/api/v1/data${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const feeds = orderFeeds(data.feeds);
  const stale = data.feeds.filter((f) => f.stale);
  const connected = data.feeds.filter((f) => f.newest !== null).length;
  const riskOf = (id: string) => data.risk.find((r) => r.feedId === id);
  const feedName = (id: string) => data.feeds.find((f) => f.id === id)?.name ?? id;
  const confTone: "est" | "book" = data.confidence < 0.9 ? "est" : "book";

  return (
    <div className="page">
      {data.baseline && (
        <Note tone="est" style={{ marginBottom: 14 }}>
          {data.baseline.deliveredDays} of {data.baseline.requiredDays} baseline days delivered. Detectors do not fire before the baseline is complete.
        </Note>
      )}

      <section className="card dq-status" aria-labelledby="dq-status-line">
        <div className="dq-status-line" id="dq-status-line">
          Data confidence {formatPct(data.confidence, 0)} · {stale.length} {stale.length === 1 ? "feed" : "feeds"} stale · {count.format(data.rowsDelivered)} rows delivered
        </div>
        <Meter value={data.confidence} tone={confTone} label={`Data confidence ${formatPct(data.confidence, 0)}`} />
        <div className="dq-status-foot">
          <Pill tone={confTone}>Composite</Pill>
          <span className="small">
            Source freshness, completeness and mapping health across the feeds, as of {formatDateYear(data.asOf)}. {connected} of {data.feeds.length} feeds connected. When this falls, every number in the product inherits the fall.
          </span>
        </div>
      </section>

      <Section title="Feeds" sub="One card per source: stale first, then by tier. Open “What this blocks” for the dollars that depend on a feed, each in its own class.">
        <div className="grid-2">
          {feeds.map((f) => (
            <FeedCard key={f.id} f={f} risk={riskOf(f.id)} />
          ))}
        </div>
      </Section>

      <Section title="Blocked by data" sub="Findings the detectors could see but could not size, because a feed they depend on has not refreshed.">
        {data.blocked.length ? (
          <div className="stack">
            {data.blocked.map((f) => (
              <article key={f.id} className="dq-blocked" id={`blocked-${f.id}`}>
                <div>
                  <div className="dq-blocked-title">{f.title}</div>
                  <div className="small" style={{ marginTop: 4 }}>
                    {f.blockedBy?.why ?? f.stateReason ?? "Blocked by a feed."}
                  </div>
                  <div className="pills" style={{ marginTop: 8 }}>
                    <Pill tone="ghost">{roomOf(f.loc, me)}</Pill>
                    {f.blockedBy && (
                      <Pill tone="bad">
                        Waiting on {feedName(f.blockedBy.feed)}
                        {f.blockedBy.ageDays != null ? ` · ${f.blockedBy.ageDays}d stale` : ""}
                      </Pill>
                    )}
                  </div>
                </div>
                <Link href={withScope(`/findings/${f.id}`, scope)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Open the finding
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="note">Nothing is blocked by a feed.</div>
        )}
      </Section>

      <Note style={{ marginTop: 20 }}>Freshness is read from the newest business date in the rows themselves — never from a stored health flag.</Note>
    </div>
  );
}
