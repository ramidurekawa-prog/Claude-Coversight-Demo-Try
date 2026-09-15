import { FindingsResponse, type ApiLocation, type FindingSummary } from "@streamline/contracts";
import { Button, EmptyState, Pill } from "@streamline/ui";
import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { daysLeft, FINDING_STATE_LABEL, formatDate, formatUsd, toneOfWord } from "../../../lib/format";
import { withScope } from "../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";
import { DECIDED_STATES, leverLabel, roomName } from "./labels";

export const metadata: Metadata = { title: "Findings" };
export const dynamic = "force-dynamic";

type View = "awaiting_decision" | "investigating" | "data_insufficient" | "decided" | "all";

const VIEWS: Array<{ key: View; label: string; empty: { title: string; body: string } }> = [
  { key: "awaiting_decision", label: "Ready to decide", empty: { title: "Nothing waiting on a decision", body: "New findings appear here as the detectors find them and they pass qualification." } },
  { key: "investigating", label: "Under investigation", empty: { title: "Nothing under investigation", body: "A finding sits here while someone gathers what the detector could not see." } },
  { key: "data_insufficient", label: "Blocked", empty: { title: "Nothing is blocked on data", body: "Every finding that fired could be sized from the feeds it needs." } },
  { key: "decided", label: "Decided", empty: { title: "No decision has been recorded yet", body: "Converted, declined, expired and superseded findings collect here with their reasons." } },
  { key: "all", label: "All", empty: { title: "No findings yet", body: "Detectors need a full baseline before any control chart may fire." } },
];

function viewOf(v: string | string[] | undefined): View {
  const s = Array.isArray(v) ? v[0] : v;
  return (VIEWS.find((x) => x.key === s)?.key ?? "awaiting_decision") as View;
}

function inView(f: FindingSummary, view: View): boolean {
  if (view === "all") return true;
  if (view === "decided") return DECIDED_STATES.includes(f.state);
  if (f.historical) return false;
  return f.state === view;
}

function FindingCard({ f, asOf, scope, locations }: { f: FindingSummary; asOf: string; scope: string | undefined; locations: ApiLocation[] }) {
  const left = daysLeft(asOf, f.expiresOn);
  const overlap = f.overlapStatus === "reduced" ? `Overlap: reduced by ${formatUsd(f.overlapDeductionCents)}/wk` : f.overlapStatus === "holds" ? "Overlap: holds" : f.overlapStatus === "unresolved" ? "Overlap: unresolved" : null;
  return (
    <article className="qc sev4" id={f.id}>
      <div style={{ minWidth: 0 }}>
        <div className="qc-over">
          {f.domain} · {leverLabel(f.lever)} · {roomName(f.loc, locations)}
          {f.daypart ? ` · ${f.daypart}` : ""}
        </div>
        <div className="qc-title">{f.title}</div>
        <div className="qc-body">{f.plain}</div>
        <div className="qc-meta">
          <Pill tone="est" title="Qualified recoverable — estimated, after recoverability and overlap">
            {formatUsd(f.recoverableCents)}/wk if it works
          </Pill>
          <Pill tone="est" title="Profit exposure — estimated, never a total">
            {formatUsd(f.exposureCents)}/wk exposure
          </Pill>
          {f.evPerHour > 0 && <Pill tone="ghost">{formatUsd(f.evPerHour)} per hour of effort</Pill>}
          <Pill tone="ghost">{f.effortHours}h of operator time</Pill>
          <Pill tone={toneOfWord(f.confidenceWord)}>{f.confidenceWord}</Pill>
          <Pill tone={f.state === "converted" ? "book" : f.historical || DECIDED_STATES.includes(f.state) ? "ghost" : "est"}>{FINDING_STATE_LABEL[f.state] ?? f.state}</Pill>
          {overlap && <Pill tone={f.overlapStatus === "unresolved" ? "bad" : "est"}>{overlap}</Pill>}
          {f.blockedBy && (
            <Pill tone="bad" title={f.blockedBy.why}>
              Blocked by {f.blockedBy.feed}
              {f.blockedBy.ageDays != null ? ` · ${f.blockedBy.ageDays}d stale` : ""}
            </Pill>
          )}
          {f.historical && <Pill tone="ghost">Historical record</Pill>}
          {f.state === "awaiting_decision" && (
            <Pill tone={left < 7 ? "bad" : "ghost"}>
              Decide by {formatDate(f.expiresOn)} · {left} days
            </Pill>
          )}
        </div>
      </div>
      <div className="qc-act">
        <Link href={withScope(`/findings/${f.id}`, scope)}>
          <Button variant="secondary" size="sm">
            Why we think so
          </Button>
        </Link>
      </div>
    </article>
  );
}

export default async function FindingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const view = viewOf(sp.state);
  const res = await serverApi(FindingsResponse, `/api/v1/findings${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, res.findings.filter((f) => inView(f, v.key)).length])) as Record<View, number>;
  const shown = res.findings.filter((f) => inView(f, view));
  const ready = counts.awaiting_decision;
  const current = VIEWS.find((v) => v.key === view)!;
  const baseline = res.findings.length === 0;

  return (
    <div className="page">
      <header className="fd-head">
        <div>
          <h1 className="fd-h1">{ready === 0 ? "Nothing is waiting on a decision" : ready === 1 ? "One finding is waiting on a decision" : `${ready} findings are waiting on a decision`}</h1>
          <p className="small" style={{ marginTop: 4, maxWidth: "64ch" }}>
            Each card is one leak the detectors found, sized as an estimate. The figures below are never added together — the ledger on Home carries the totals, one class at a time.
          </p>
        </div>
        <span className="xs">As of {formatDate(res.asOf)}</span>
      </header>

      <nav className="fd-tabs" aria-label="Filter findings">
        {VIEWS.map((v) => (
          <Link key={v.key} href={withScope(`/findings?state=${v.key}`, scope)} className={`fd-tab${v.key === view ? " on" : ""}`} aria-current={v.key === view ? "page" : undefined}>
            {v.label}
            <span className="n">{counts[v.key]}</span>
          </Link>
        ))}
      </nav>

      {shown.length ? (
        <div className="stack">
          {shown.map((f) => (
            <FindingCard key={f.id} f={f} asOf={res.asOf} scope={scope} locations={me.locations} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Inbox size={20} />} title={current.empty.title} description={baseline ? "New findings appear as the detectors find them; this account is still inside its baseline, so no control chart has been allowed to fire." : current.empty.body} action={view !== "all" && counts.all > 0 ? <Link href={withScope("/findings?state=all", scope)}><Button variant="secondary">See every finding</Button></Link> : undefined} />
      )}

      {shown.length > 0 && <p className="after">Sorted by qualified recoverable, largest first, as the ledger serves them. A recoverable figure is an estimate after the lever&apos;s recovery factor and any overlap deduction; it is not a saving until a window closes and the gates pass.</p>}
    </div>
  );
}
