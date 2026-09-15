"use client";

import { ApiRequestError, apiFetch, CompleteActionResponse, type LedgerAction, type PersonaRole } from "@streamline/contracts";
import { Button, EmptyState, Kv, Note, Pill, Section } from "@streamline/ui";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Drawer } from "../../../components/shell/drawer";
import { formatDate, formatDateYear } from "../../../lib/format";
import { withScope } from "../../../lib/scope";

const STATE: Record<LedgerAction["state"], { tone: "est" | "book" | "bad"; word: string }> = {
  open: { tone: "est", word: "Open" },
  done: { tone: "book", word: "Done" },
  not_executed: { tone: "bad", word: "Not executed" },
};

/** Overdue is a date comparison against the org's business date, never the wall clock. */
function isOverdue(a: LedgerAction, asOf: string): boolean {
  return a.state === "open" && a.dueOn < asOf;
}

function CompleteDrawer({ a, asOf, room, onClose }: { a: LedgerAction; asOf: string; room: string; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = React.useState(a.evidenceRequired);
  const [detail, setDetail] = React.useState("");
  const [doneOn, setDoneOn] = React.useState(asOf);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail.trim()) {
      setError("Say what the evidence is. A blank line is not evidence.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(CompleteActionResponse, `/api/v1/actions/${encodeURIComponent(a.id)}/complete`, {
        method: "POST",
        body: JSON.stringify({ evidence: [{ type: type.trim() || a.evidenceRequired, detail: detail.trim() }], doneOn }),
      });
      setDone(`Done. ${r.intervention ? `Window open on ${r.intervention.id}: result on ${formatDate(r.intervention.eligibleOn)}. The measurement clock starts at executed, never at approval.` : "Recorded."}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.status === 403 ? `Your role may read but not execute. ${err.message}` : err.message);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Mark done with evidence"
      sub={`${a.id} · ${a.title}`}
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="ac-complete" loading={busy}>
              Mark done
            </Button>
          </>
        )
      }
    >
      <Note>Evidence is what makes an execution real. It is attached to {a.id} and written to the audit trail with your name and the business date. When this action executes a change, that change&apos;s measurement window opens from the date below, not from the day it was approved.</Note>
      <Kv
        rows={[
          { k: "Owner", v: a.owner },
          { k: "Due", v: formatDateYear(a.dueOn) },
          { k: "Room", v: room },
          { k: "Next", v: a.next },
          { k: "Evidence required", v: a.evidenceRequired },
        ]}
      />
      {done ? (
        <Note tone="ok" role="status">
          {done}
        </Note>
      ) : (
        <form id="ac-complete" onSubmit={submit} className="stack">
          <label className="field">
            <span className="field-label">Evidence type</span>
            <input className="input" value={type} onChange={(e) => setType(e.target.value)} required />
            <span className="field-hint">What is asked for: {a.evidenceRequired}</span>
          </label>
          <label className="field">
            <span className="field-label">Detail</span>
            <textarea className="textarea" value={detail} onChange={(e) => setDetail(e.target.value)} required placeholder="Receipt number, who signed, what was published, where it can be checked." />
          </label>
          <label className="field">
            <span className="field-label">Done on</span>
            <input type="date" className="input" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} required />
            <span className="field-hint">Business date. Defaults to the clock, {formatDateYear(asOf)}.</span>
          </label>
          {error && (
            <Note tone="bad" role="alert">
              {error}
            </Note>
          )}
        </form>
      )}
    </Drawer>
  );
}

export function ActionsBoard({ asOf, actions, scope, rooms, role }: { asOf: string; actions: LedgerAction[]; scope: string | undefined; rooms: Record<string, string>; role: PersonaRole }) {
  const [active, setActive] = React.useState<LedgerAction | null>(null);
  const close = React.useCallback(() => setActive(null), []);
  const open = actions.filter((a) => a.state === "open");
  const overdue = open.filter((a) => isOverdue(a, asOf));
  const done = actions.filter((a) => a.state === "done");
  const roomOf = (loc: string) => (loc === "group" ? "All rooms" : (rooms[loc] ?? loc));

  return (
    <>
      <header className="stack" style={{ gap: 10 }}>
        <div className="ac-tiles">
          <div className={`kpi ${overdue.length ? "kpi-bad" : "kpi-book"}`}>
            <div className="kpi-label">Overdue</div>
            <div className={`kpi-value ${overdue.length ? "tone-bad" : "tone-book"}`}>{overdue.length}</div>
            <div className="kpi-foot">Open and past due on {formatDate(asOf)}</div>
          </div>
          <div className="kpi kpi-est">
            <div className="kpi-label">Open</div>
            <div className="kpi-value tone-est">{open.length}</div>
            <div className="kpi-foot">Waiting on a person</div>
          </div>
          <div className="kpi kpi-book">
            <div className="kpi-label">Done</div>
            <div className="kpi-value tone-book">{done.length}</div>
            <div className="kpi-foot">Evidence on record</div>
          </div>
        </div>
        <p className="small">An action, not a dollar. Nothing on this screen is money. The measurement clock starts at executed, never at approval, and marking done with evidence is what starts it.</p>
        {role === "finance" && <p className="xs">Your role may read but not execute. The button is shown so you can see what the operator sees.</p>}
      </header>

      <Section title="Every action in scope" sub="Each row is a person, a date, and the evidence that will show it happened." right={<span className="xs">{actions.length}</span>}>
        {actions.length === 0 ? (
          <EmptyState icon={<ListChecks size={20} />} title="No actions in this scope" description="Actions appear when a finding is accepted, a reversal is planned, a feed needs reconnecting, or a controller asks a question. None is waiting here." />
        ) : (
          <div className="stack">
            {actions.map((a) => {
              const late = isOverdue(a, asOf);
              return (
                <article key={a.id} id={a.id} className={`ac-row ${a.state === "done" ? "is-done" : ""}`} aria-label={`${a.id} ${a.title}`}>
                  <div className="ac-main">
                    <div className="ac-title">
                      <span className="mono xs" style={{ marginRight: 8 }}>
                        {a.id}
                      </span>
                      {a.title}
                    </div>
                    <div className="ac-sub">
                      Next: {a.next} · Evidence: {a.evidenceRequired}
                    </div>
                    {(a.interventionId || a.findingId) && (
                      <div className="ac-links">
                        {a.interventionId && <Link href={withScope(`/changes/${a.interventionId}`, scope)}>Change {a.interventionId} →</Link>}
                        {a.findingId && <Link href={withScope(`/findings/${a.findingId}`, scope)}>Finding {a.findingId} →</Link>}
                      </div>
                    )}
                  </div>
                  <div className="ac-cell">
                    <span className="lbl">Owner</span>
                    <span>{a.owner}</span>
                    {a.tier && (
                      <span className="pills">
                        <Pill tone="ghost">{a.tier} tier</Pill>
                      </span>
                    )}
                  </div>
                  <div className="ac-cell">
                    <span className="lbl">Due</span>
                    <span className="pills">
                      <Pill tone={late ? "bad" : "ghost"}>
                        {late ? "Overdue" : "Due"} {formatDate(a.dueOn)}
                      </Pill>
                    </span>
                    {a.state === "done" && a.doneOn ? <span className="xs">Done {formatDate(a.doneOn)}</span> : null}
                  </div>
                  <div className="ac-cell">
                    <span className="lbl">Room</span>
                    <span>{roomOf(a.loc)}</span>
                  </div>
                  <div className="ac-cell">
                    <span className="lbl">State</span>
                    <span className="pills">
                      <Pill tone={STATE[a.state].tone}>{STATE[a.state].word}</Pill>
                    </span>
                  </div>
                  <div className="ac-act">
                    {a.state === "open" ? (
                      <Button size="sm" className="ac-btn" onClick={() => setActive(a)}>
                        Mark done with evidence
                      </Button>
                    ) : (
                      <span className="xs">{a.state === "done" ? "Evidence on record" : "Closed without execution"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      {active && <CompleteDrawer a={active} asOf={asOf} room={roomOf(active.loc)} onClose={close} />}
    </>
  );
}
