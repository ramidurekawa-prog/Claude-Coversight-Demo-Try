import { describe, expect, it } from "vitest";
import { canFindingTransition, canInterventionTransition, FINDING_STATES, IV_STATES, type InterventionState } from "../src/states.js";

describe("intervention state machine (System 9)", () => {
  it("forbids a recommendation becoming verified, and execution alone verifying", () => {
    expect(canInterventionTransition("approved", "verified").ok).toBe(false);
    expect(canInterventionTransition("executed", "verified").ok).toBe(false);
  });
  it("verified is writable only out of measuring", () => {
    for (const s of Object.keys(IV_STATES) as InterventionState[]) {
      expect(canInterventionTransition(s, "verified").ok).toBe(s === "measuring");
    }
  });
  it("walks the happy path", () => {
    const path: InterventionState[] = ["draft", "awaiting_approval", "approved", "scheduled", "in_progress", "evidence_pending", "executed", "measurement_pending", "measuring", "verified", "persistence_monitoring", "persistent", "closed"];
    for (let i = 1; i < path.length; i++) expect(canInterventionTransition(path[i - 1]!, path[i]!).ok).toBe(true);
  });
  it("has eighteen states and terminal closed", () => {
    expect(Object.keys(IV_STATES)).toHaveLength(18);
    expect(canInterventionTransition("closed", "draft").ok).toBe(false);
  });
});

describe("finding state machine (System 8)", () => {
  it("has eleven states, five terminal", () => {
    expect(Object.keys(FINDING_STATES)).toHaveLength(11);
    expect(Object.values(FINDING_STATES).filter((s) => s.terminal)).toHaveLength(5);
  });
  it("only awaiting_decision can be accepted or rejected", () => {
    expect(canFindingTransition("awaiting_decision", "accepted").ok).toBe(true);
    expect(canFindingTransition("detected", "accepted").ok).toBe(false);
    expect(canFindingTransition("rejected", "accepted").ok).toBe(false);
  });
});
