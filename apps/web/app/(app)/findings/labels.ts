/**
 * Labels for the findings screens. Words only: nothing here touches a cent.
 * Lever, guardrail and autonomy vocabularies come from the engine registry so
 * a chip reads the same word the engine used.
 */
import type { ApiLocation, AutonomyLevel, FindingState, Lever } from "@streamline/contracts";
import { AUTONOMY, GUARDRAILS, LEVERS } from "@streamline/engine";
import { formatPct, formatUsd, type Tone } from "../../../lib/format";

/** "group" is the whole organisation; anything else is a room code. */
export function roomName(loc: string, locations: ApiLocation[]): string {
  if (loc === "group") return "All rooms";
  return locations.find((l) => l.code === loc || l.id === loc)?.short ?? loc;
}

export function roomGm(loc: string, locations: ApiLocation[]): string | null {
  if (loc === "group") return null;
  return locations.find((l) => l.code === loc || l.id === loc)?.gm ?? null;
}

export function leverLabel(lever: Lever): string {
  return LEVERS[lever]?.label ?? lever;
}

export function guardrailLabel(id: string): string {
  return GUARDRAILS[id]?.label ?? id.replace(/_/g, " ");
}

export function autonomyLabel(level: AutonomyLevel): string {
  const a = AUTONOMY.find((x) => x.level === level);
  return a ? `${a.level} · ${a.label}` : level;
}

export const OPEN_STATES: FindingState[] = ["detected", "investigating", "qualified", "awaiting_decision", "accepted"];
export const DECIDED_STATES: FindingState[] = ["converted", "rejected", "expired", "superseded", "invalidated"];

/** est for an open state, book for converted, ghost for every terminal state. */
export function stateTone(state: FindingState): Tone {
  if (state === "converted") return "book";
  if (OPEN_STATES.includes(state)) return "est";
  return "ghost";
}

/** Render an observed value in the unit the detector declared. Formatting only. */
export function formatObserved(v: number, unit: string): string {
  switch (unit) {
    case "ratio":
      return formatPct(v);
    case "cents":
    case "cents_per_unit":
      return formatUsd(v);
    case "hours":
      return `${v.toFixed(1)} h`;
    case "minutes":
      return `${v.toFixed(1)} min`;
    case "":
      return v === 0 ? "—" : String(v);
    default:
      return `${Number.isInteger(v) ? v : v.toFixed(2)} ${unit}`;
  }
}
