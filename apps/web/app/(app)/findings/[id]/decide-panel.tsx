"use client";

import { ApiRequestError, apiFetch, DecideFindingResponse, type FindingState, type RejectionCode } from "@streamline/contracts";
import { Button, Card, CardBody, CardHead } from "@streamline/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { formatDateYear } from "../../../../lib/format";
import { Drawer } from "../../../../components/shell/drawer";

/** ISO business-date arithmetic on the string; no Date object leaks into state. */
function plusDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

const REJECT_CODES: Array<{ code: RejectionCode; label: string }> = [
  { code: "seasonal_not_negotiable", label: "Seasonal — the vendor will not hold a price" },
  { code: "already_addressed", label: "Already being addressed outside the product" },
  { code: "service_risk", label: "Operationally too risky to service" },
  { code: "not_worth_effort", label: "Not worth the operator time" },
  { code: "wrong_root_cause", label: "The stated cause is wrong" },
  { code: "other", label: "Other (reason required)" },
];

type Mode = "accept" | "investigate" | "reject";

interface Done {
  kind: Mode;
  text: React.ReactNode;
}

export function DecidePanel({ id, asOf, state, allowedTransitions, proposal, roomGm, scope }: { id: string; asOf: string; state: FindingState; allowedTransitions: FindingState[]; proposal: string; roomGm: string | null; scope: string | undefined }) {
  const router = useRouter();
  const canAccept = allowedTransitions.includes("accepted");
  const canReject = allowedTransitions.includes("rejected");
  const canInvestigate = allowedTransitions.includes("investigating");
  const canDecide = canAccept || canReject || canInvestigate;
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);
  const [owner, setOwner] = React.useState("");
  const [dueOn, setDueOn] = React.useState(plusDays(asOf, 7));
  const [reason, setReason] = React.useState("");
  const [code, setCode] = React.useState<RejectionCode | null>(null);

  const close = React.useCallback(() => {
    setMode(null);
    setError(null);
  }, []);

  const q = scope && scope !== "all" ? `?scope=${encodeURIComponent(scope)}` : "";

  async function submit(body: Record<string, unknown>, kind: Mode) {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(DecideFindingResponse, `/api/v1/findings/${encodeURIComponent(id)}/decide`, { method: "POST", body: JSON.stringify(body) });
      if (kind === "accept" && r.action && r.intervention) {
        const a = r.action;
        const iv = r.intervention;
        setDone({
          kind,
          text: (
            <>
              Created <Link href={`/actions${q}#${a.id}`}>{a.id}</Link> and <Link href={`/changes/${iv.id}${q}`}>{iv.id}</Link>. The plan is frozen: {iv.plan.primary}, {iv.plan.windowDays}-day window, compared with {iv.plan.comparison.toLowerCase()}. {a.owner} owns the action, due {formatDateYear(a.dueOn)}. Nothing has been counted — the clock starts when the action is marked done with evidence.
            </>
          ),
        });
      } else if (kind === "investigate") {
        setDone({ kind, text: <>Held for investigation on {formatDateYear(asOf)}; the card now reads “{r.finding.state.replace(/_/g, " ")}”. The reason is on its history and the decision window is unchanged.</> });
      } else {
        setDone({ kind, text: <>Declined. The reason is recorded on the finding&apos;s history and nothing was created.</> });
      }
      setMode(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canDecide && !done) return null;

  return (
    <section className="sect" id="decide">
      <div className="sect-head">
        <div>
          <h2 className="sect-title">Decide</h2>
          <div className="sect-sub">One decision per card. Accepting creates an action and a change with a frozen measurement plan; it does not create a dollar.</div>
        </div>
      </div>
      <Card accent="brand" className="fd-decide">
        <CardHead title={done ? "Decision recorded" : "What would you like to do with this finding?"} sub={done ? `Recorded as of ${formatDateYear(asOf)}` : `The card is in the state “${state.replace(/_/g, " ")}”. Every transition carries your name, the business date and, where required, a reason.`} />
        <CardBody>
          {done ? (
            <div className={`note ${done.kind === "accept" ? "note-ok" : done.kind === "reject" ? "note-bad" : "note-mod"}`}>{done.text}</div>
          ) : (
            <>
              <div className="fd-actions">
                {canAccept && <Button onClick={() => setMode("accept")}>Accept — create the action</Button>}
                {canInvestigate && (
                  <Button variant="secondary" onClick={() => setMode("investigate")}>
                    Ask for more data
                  </Button>
                )}
                {canReject && (
                  <Button variant="destructive" onClick={() => setMode("reject")}>
                    Decline, with a reason
                  </Button>
                )}
              </div>
              {error && !mode && <div className="note note-bad">{error}</div>}
              <div className="xs">One decision per card. Accepting creates an action and a change with a frozen measurement plan; it does not create a dollar.</div>
            </>
          )}
        </CardBody>
      </Card>

      {mode === "accept" && (
        <Drawer
          title="Accept — create the action"
          sub="An owner, a due date, and a plan frozen before anything is executed."
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => submit({ decision: "accept", ...(owner.trim() ? { owner: owner.trim() } : {}), dueOn }, "accept")} loading={busy}>
                Accept and create the action
              </Button>
            </>
          }
        >
          <div className="note">{proposal}</div>
          <label className="field">
            <span className="field-label">Owner</span>
            <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={roomGm ? `Defaults to the room's GM (${roomGm})` : "Defaults to the room's GM"} />
            <span className="field-hint">Leave empty to assign the room&apos;s general manager.</span>
          </label>
          <label className="field">
            <span className="field-label">Due date</span>
            <input type="date" className="input" value={dueOn} min={plusDays(asOf, 1)} onChange={(e) => setDueOn(e.target.value)} />
            <span className="field-hint">Business date; seven days from {formatDateYear(asOf)} by default.</span>
          </label>
          <div className="note note-est">
            <strong>What accepting creates.</strong> An action with an owner and a due date, and a change with a measurement plan frozen before execution. It does not create a dollar.
          </div>
          {error && <div className="note note-bad">{error}</div>}
        </Drawer>
      )}

      {mode === "investigate" && (
        <Drawer
          title="Ask for more data"
          sub="The finding stays open while someone looks. Say what you are waiting for."
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => submit({ decision: "investigate", reason: reason.trim() }, "investigate")} loading={busy} disabled={!reason.trim()}>
                Hold for investigation
              </Button>
            </>
          }
        >
          <label className="field">
            <span className="field-label">What needs checking</span>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: a re-quote is out with the vendor; their answer is due next week." />
            <span className="field-hint">Recorded on the finding&apos;s history with your name and the business date.</span>
          </label>
          {error && <div className="note note-bad">{error}</div>}
        </Drawer>
      )}

      {mode === "reject" && (
        <Drawer
          title="Decline, with a reason"
          sub="A declined finding is a terminal record. The reason code and the reason stay with it."
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => submit({ decision: "reject", code, reason: reason.trim() }, "reject")} loading={busy} disabled={!code || !reason.trim()}>
                Decline this finding
              </Button>
            </>
          }
        >
          <div className="choices" role="radiogroup" aria-label="Reason code">
            {REJECT_CODES.map((c) => (
              <label key={c.code} className={`choice${code === c.code ? " on" : ""}`}>
                <input type="radio" name="reject-code" value={c.code} checked={code === c.code} onChange={() => setCode(c.code)} />
                <span>
                  <span className="choice-title">{c.label}</span>
                  <span className="choice-desc" style={{ display: "block" }}>
                    {c.code.replace(/_/g, " ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Reason</span>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Say why, in a sentence the next reader will understand." />
            <span className="field-hint">Required for every code.</span>
          </label>
          {error && <div className="note note-bad">{error}</div>}
        </Drawer>
      )}
    </section>
  );
}
