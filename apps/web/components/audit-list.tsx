import type { AuditEvent } from "@streamline/contracts";
import { formatDate } from "../lib/format";

/** Rule 9: every transition carries an actor, a business date and a reason. */
export function AuditList({ events, empty = "No events recorded yet." }: { events: AuditEvent[]; empty?: string }) {
  if (!events.length) return <div className="note">{empty}</div>;
  return (
    <div className="timeline">
      {events.map((e) => (
        <div key={e.id} className="tl-row">
          <div className="tl-when">{formatDate(e.on)}</div>
          <div>
            <div className="tl-what">
              {e.event.replace(/_/g, " ")}
              {e.fromState && e.toState ? <span className="muted"> · {e.fromState.replace(/_/g, " ")} → {e.toState.replace(/_/g, " ")}</span> : null}
            </div>
            <div className="tl-who">{e.actor}</div>
            {e.reason && <div className="tl-why">{e.reason}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
