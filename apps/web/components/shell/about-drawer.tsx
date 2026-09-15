"use client";

import type { MeResponse } from "@streamline/contracts";
import { Drawer } from "./drawer";

const ROWS: Array<{ capability: string; status: string; tone: "book" | "est" | "ghost" }> = [
  { capability: "Detection (EWMA / CUSUM control charts, change-point onset dating), overlap resolution, qualification", status: "Implemented — runs on the register", tone: "book" },
  { capability: "Measurement (difference-in-differences with a placebo test and a pre-computed MDE; direct reconciliation for purchasing), gates, the mint, persistence, the ledger, state machines, eight-dimension confidence", status: "Implemented — every figure on every screen is computed by it", tone: "book" },
  { capability: "The register (checks, order lines, shifts, invoices, reviews, reservations) and feed freshness / completeness", status: "Simulated from a seeded, deterministic fixture — realistic, not real", tone: "est" },
  { capability: "P&L bridge / reconciliation", status: "Bridge arithmetic implemented; the ledger side stands in for the accounting feed", tone: "est" },
  { capability: "POS, scheduling, KDS, reservations and accounting connectors; write-back", status: "Interface only — nothing is contacted", tone: "ghost" },
  { capability: "AI or language-model features", status: "None. No model computes, adjusts or narrates a number", tone: "ghost" },
];

export function AboutDrawer({ me, onClose }: { me: MeResponse; onClose: () => void }) {
  return (
    <Drawer title="About this demo" sub={`${me.org.name} is a fixture. Every number was computed at load from a generated register.`} onClose={onClose}>
      <div className="note">
        <strong>{me.org.name}</strong> — {me.org.fixtureLabel}. The register is a deterministic function of a seed; signals are planted in the rows and the detectors have to find them. Advancing the clock extends the register and applies the changes you make here, so the loop can close inside the demo.
      </div>
      <table className="t">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.capability}>
              <td>{r.capability}</td>
              <td>
                <span className={`pill pill-${r.tone}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        Words are policed: <em>banked</em>, <em>realized</em>, <em>recovered</em> and <em>saved</em> appear only beside realized-class money, and the three words that promise certainty never appear anywhere. Two claim classes are never added together. A confidence word always expands into the eight dimensions that produced it.
      </div>
    </Drawer>
  );
}
