"use client";

import { AdvanceClockResponse, ApiRequestError, apiFetch, ResetResponse, type MeResponse } from "@streamline/contracts";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@streamline/ui";
import { formatDateYear } from "../../lib/format";
import { Drawer } from "./drawer";

function plusDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

/** Synthetic-data controls: advance the business clock (runs the nightly job) or reset the org. Owner and admin only. */
export function DemoControls({ me, onClose }: { me: MeResponse; onClose: () => void }) {
  const router = useRouter();
  const [toDate, setToDate] = React.useState(plusDays(me.org.asOf, 28));
  const [busy, setBusy] = React.useState<"advance" | "reset" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const canControl = me.persona.role === "owner" || me.persona.role === "admin";

  async function advance() {
    setBusy("advance");
    setError(null);
    try {
      const r = await apiFetch(AdvanceClockResponse, "/api/v1/demo/advance", { method: "POST", body: JSON.stringify({ toDate }) });
      setDone(`The clock now stands on ${formatDateYear(r.asOf)}. ${r.run.findingsFired} findings fired; ${r.run.notes ?? ""}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function reset() {
    if (!window.confirm("Reset this organisation to the fixture? Every decision made in the product is discarded.")) return;
    setBusy("reset");
    setError(null);
    try {
      const r = await apiFetch(ResetResponse, "/api/v1/demo/reset", { method: "POST", body: "{}" });
      setDone(`Reset. The clock stands on ${formatDateYear(r.asOf)}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer title="Demo clock" sub={`Business date ${formatDateYear(me.org.asOf)} · synthetic data control`} onClose={onClose}>
      <div className="note">
        Every figure is computed as of the business date. Advancing the clock extends the synthetic register through the new date — applying any change executed in the product — then runs the nightly job: detectors re-run, open windows close, the verification service decides, persistence is re-checked, adjustments are appended. Nothing already verified is rewritten.
      </div>
      {canControl ? (
        <>
          <label className="field">
            <span className="field-label">Advance to</span>
            <input type="date" className="input" value={toDate} min={plusDays(me.org.asOf, 1)} max={plusDays(me.org.asOf, 120)} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {[7, 14, 28, 42].map((n) => (
              <Button key={n} variant="secondary" size="sm" onClick={() => setToDate(plusDays(me.org.asOf, n))}>
                +{n} days
              </Button>
            ))}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <Button onClick={advance} loading={busy === "advance"} disabled={busy !== null}>
              Advance the clock
            </Button>
            <Button variant="destructive" onClick={reset} loading={busy === "reset"} disabled={busy !== null}>
              Reset the demo
            </Button>
          </div>
        </>
      ) : (
        <div className="note note-est">Only the owner or a Streamline admin may move the clock. Sign in as Rose Jorge to run the loop end to end.</div>
      )}
      {error && <div className="note note-bad">{error}</div>}
      {done && <div className="note note-ok">{done}</div>}
    </Drawer>
  );
}
