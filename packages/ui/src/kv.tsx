import * as React from "react";
import { cn } from "./cn";

/** Key–value rows: the derivation underneath a plain sentence. */
export function Kv({ rows, className }: { rows: Array<{ k: React.ReactNode; v: React.ReactNode; mono?: boolean }>; className?: string }) {
  return (
    <dl className={cn("kv", className)}>
      {rows.map((r, i) => (
        <div key={i} className="kv-row">
          <dt className="kv-k">{r.k}</dt>
          <dd className={cn("kv-v", r.mono && "mono")}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A gate / evidence / test row: ✓ passed, ! failed, ~ non-blocking. */
export function GateRow({ status, label, detail }: { status: "pass" | "fail" | "soft" | "pending"; label: React.ReactNode; detail?: React.ReactNode }) {
  const glyph = status === "pass" ? "✓" : status === "fail" ? "!" : status === "soft" ? "~" : "·";
  return (
    <div className={cn("gate", `gate-${status}`)}>
      <span className="gate-mark" aria-hidden="true">
        {glyph}
      </span>
      <div className="gate-text">
        <div className="gate-label">{label}</div>
        {detail && <div className="gate-detail">{detail}</div>}
      </div>
    </div>
  );
}

/** A note: panel background, optional tone. */
export function Note({ tone, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: "warn" | "ok" | "est" | "mod" | "bad" }) {
  return <div className={cn("note", tone && `note-${tone}`, className)} {...props} />;
}

/** Section heading: uppercase tracked label with an optional sub-line. */
export function Section({ title, sub, right, className, children }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <section className={cn("sect", className)}>
      <div className="sect-head">
        <div>
          <h2 className="sect-title">{title}</h2>
          {sub && <div className="sect-sub">{sub}</div>}
        </div>
        {right && <div className="sect-right">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** A horizontal meter (0–1) coloured by tone. */
export function Meter({ value, tone = "book", className, label }: { value: number; tone?: "est" | "mod" | "cau" | "book" | "bad" | "neu"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("meter", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className={cn("meter-fill", `meter-${tone}`)} style={{ width: `${pct}%` }} />
    </div>
  );
}
