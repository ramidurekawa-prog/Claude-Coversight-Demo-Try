import { TodayResponse, type MeResponse, type QueueCard } from "@streamline/contracts";
import { buttonVariants, EmptyState, Pill, Section } from "@streamline/ui";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { classLabel, formatDate, formatDateYear, formatUsd, toneOfClass } from "../../../lib/format";
import { withScope } from "../../../lib/scope";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/** Severity follows the rank the queue policy assigned. The page never re-ranks. */
function sevOfRank(rank: number): "sev1" | "sev2" | "sev3" | "sev4" {
  if (rank <= 1) return "sev1";
  if (rank === 2) return "sev2";
  if (rank <= 4) return "sev3";
  return "sev4";
}

type Band = "blocking" | "decide" | "execute" | "watch";

const BANDS: ReadonlyArray<{ key: Band; title: string; sub: string }> = [
  { key: "blocking", title: "Blocking everything else", sub: "A guardrail breach, a stale feed, an unresolved overlap. Nothing beneath is sized cleanly until these clear." },
  { key: "decide", title: "Decide", sub: "A yes, a no, or an allocation. Decision windows close on their own." },
  { key: "execute", title: "Execute", sub: "An action, not a dollar. The measurement clock starts at executed, never at approval." },
  { key: "watch", title: "Watch", sub: "Nothing to do today; worth knowing." },
];

const DECIDE: ReadonlySet<QueueCard["type"]> = new Set<QueueCard["type"]>(["high_value", "overlap", "recon_question", "window_eligible"]);
const EXECUTE: ReadonlySet<QueueCard["type"]> = new Set<QueueCard["type"]>(["action_due", "missing_evidence"]);

function bandOf(c: QueueCard): Band {
  if (c.rank <= 2) return "blocking";
  if (DECIDE.has(c.type)) return "decide";
  if (EXECUTE.has(c.type)) return "execute";
  return "watch";
}

/** The record behind the card. The fragment goes after the scope query, never before it. */
function cardHref(c: QueueCard, scope: string | undefined): string {
  switch (c.ref.kind) {
    case "finding":
      return withScope(`/findings/${c.ref.id}`, scope);
    case "intervention":
      return withScope(`/changes/${c.ref.id}`, scope);
    case "action":
      return `${withScope("/actions", scope)}#${c.ref.id}`;
    case "feed":
      return `${withScope("/data", scope)}#${c.ref.id}`;
    default:
      return `${withScope("/proof", scope)}#${c.ref.id}`;
  }
}

function roomOf(loc: string, me: MeResponse): string {
  if (loc === "group") return "All rooms";
  return me.locations.find((l) => l.code === loc)?.short ?? loc;
}

function TodayCard({ c, asOf, scope, room }: { c: QueueCard; asOf: string; scope: string | undefined; room: string }) {
  const overdue = c.overdue ?? (c.dueOn != null && c.dueOn < asOf);
  return (
    <article className={`qc ${sevOfRank(c.rank)} td-card`} id={c.id} aria-label={c.title}>
      <div>
        <div className="qc-over">
          {c.label} · {c.who}
        </div>
        <div className="qc-title">{c.title}</div>
        <div className="qc-body">{c.body}</div>
        <div className="qc-meta">
          {c.moneyCents != null && c.moneyClass ? (
            <Pill tone={toneOfClass(c.moneyClass)}>
              {formatUsd(c.moneyCents)}/wk · {classLabel(c.moneyClass)}
            </Pill>
          ) : null}
          {c.dueOn ? (
            <Pill tone={overdue ? "bad" : "ghost"}>
              {overdue ? "Overdue" : "Due"} {formatDate(c.dueOn)}
            </Pill>
          ) : null}
          <Pill tone="ghost">{room}</Pill>
        </div>
      </div>
      <div className="qc-act">
        <Link href={cardHref(c, scope)} className={`${buttonVariants({ variant: "secondary", size: "sm" })} td-act`}>
          {c.act}
        </Link>
      </div>
    </article>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const today = await serverApi(TodayResponse, `/api/v1/today${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const n = today.cards.length;
  // Server order is preserved inside every band; only the band headings are added here.
  const bands = BANDS.map((b) => ({ ...b, cards: today.cards.filter((c) => bandOf(c) === b.key) })).filter((b) => b.cards.length > 0);

  return (
    <div className="page td-page">
      <header className="td-head">
        <div className="td-n mono" aria-hidden="true">
          {n}
        </div>
        <div>
          <p className="td-line">
            {n} {n === 1 ? "item" : "items"} · ranked by what it costs to ignore, not by size · {today.policyVersion}
          </p>
          <p className="small">Business date {formatDateYear(today.asOf)}. One card, one button. The money on a card is that card&apos;s own figure in its own class; nothing here is a total.</p>
        </div>
      </header>

      {n === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={20} />}
          title="Nothing needs you today"
          description="Every guardrail held, every feed is current, and no decision is waiting. That is what a quiet week looks like."
          action={
            <Link href={withScope("/", scope)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Back to Home
            </Link>
          }
        />
      ) : (
        bands.map((b) => (
          <Section key={b.key} title={b.title} sub={b.sub} right={<span className="xs">{b.cards.length}</span>}>
            <div className="stack">
              {b.cards.map((c) => (
                <TodayCard key={c.id} c={c} asOf={today.asOf} scope={scope} room={roomOf(c.loc, me)} />
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  );
}
