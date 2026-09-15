import type { FunnelStage } from "@streamline/contracts";
import { Pill } from "@streamline/ui";
import { classLabel, formatUsd, toneOfClass } from "../../lib/format";

/** Equal-height rows; bar length ∝ dollars within its own class; colour = class. Stages are never summed. */
export function FunnelBars({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.cents), 1);
  return (
    <div className="stack" style={{ gap: 2 }}>
      {stages.map((s) => {
        const tone = s.klass ? toneOfClass(s.klass) : "neu";
        return (
          <div key={s.stage} className="funnel-row">
            <div>
              <div style={{ fontWeight: 600 }}>{s.stage}</div>
              <div className="xs">{s.n} items</div>
            </div>
            <div className="bar-track" style={{ height: 14 }}>
              <div className="bar-fill" style={{ width: `${Math.max(2, (s.cents / max) * 100)}%`, background: `var(--claim-${tone})` }} />
            </div>
            <div className="r mono" style={{ textAlign: "right" }}>
              <div>{formatUsd(s.cents)}/wk</div>
              {s.klass && (
                <Pill tone={tone} style={{ marginTop: 3 }}>
                  {classLabel(s.klass)}
                </Pill>
              )}
            </div>
            {s.lost && <div className="lost">{s.lost}</div>}
          </div>
        );
      })}
    </div>
  );
}
