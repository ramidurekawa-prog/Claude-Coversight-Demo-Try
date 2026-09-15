import type { ConfidenceProfile, ConfWord } from "@streamline/contracts";
import { Meter, Pill } from "@streamline/ui";
import { toneOfWord } from "../lib/format";

const LABELS: Record<keyof ConfidenceProfile, string> = {
  data: "Data",
  measurement: "Measurement",
  attribution: "Attribution",
  execution: "Execution",
  comparability: "Comparability",
  guardrail: "Guardrails",
  persistence: "Persistence",
  reconciliation: "Reconciliation",
};

/** Rule 7: no confidence badge without its basis. The word expands into the eight dimensions that produced it. */
export function ConfBlock({ profile, word }: { profile: ConfidenceProfile; word: ConfWord }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <Pill tone={toneOfWord(word)}>{word}</Pill>
        <span className="xs">One of six words, derived from the eight dimensions below. “High confidence” on its own is banned.</span>
      </div>
      <div className="conf">
        {(Object.keys(LABELS) as Array<keyof ConfidenceProfile>).map((k) => {
          const d = profile[k];
          const tone = d.score < 0.34 ? "bad" : d.score < 0.67 ? "est" : "book";
          return (
            <div key={k} className="conf-row">
              <div className="conf-label">{LABELS[k]}</div>
              <Meter value={d.score} tone={tone} label={`${LABELS[k]} ${Math.round(d.score * 100)}%`} />
              <div>
                <div className="conf-basis">{d.basis}</div>
                <div className="conf-blocks">{d.blocks}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
