/**
 * Money: integer cents, always, carrying its claim class.
 *
 * Doctrine 3 / System 4: twelve named financial quantities on four strengths.
 * Adding two classes throws. The verified → bookable path is the ONLY way to
 * reach a billable rung, and it lives in verify.ts behind a private token.
 */

export type Cents = number;

export function assertCents(value: number, label = "amount"): Cents {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be integer cents, got ${String(value)}`);
  }
  return value;
}

/** Round a float amount (in cents) to integer cents. Use only at the last step. */
export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) throw new Error(`cannot round non-finite value ${String(value)}`);
  return Math.round(value);
}

export type ClaimStrength = "estimated" | "modelled" | "causal" | "bookable";
export const STRENGTH_RANK: Record<ClaimStrength, number> = { estimated: 1, modelled: 2, causal: 3, bookable: 4 };

export type ClaimClass =
  | "profit_exposure"
  | "identified_exposure"
  | "recoverable"
  | "projected"
  | "committed"
  | "measured"
  | "causal"
  | "verified"
  | "bookable"
  | "realized"
  | "maintained"
  | "adjustment";

export interface ClaimClassSpec {
  label: string;
  strength: ClaimStrength;
  aggregate: false | true | "location" | "dedup" | "class" | "separate";
  headline: false | true | "in-flight" | "labelled";
  billable: false | true | "agreement";
  /** How the operator is told about it (Doctrine 3). */
  said: string;
}

export const CLAIM_CLASS: Record<ClaimClass, ClaimClassSpec> = {
  profit_exposure: { label: "Profit exposure", strength: "estimated", aggregate: false, headline: false, billable: false, said: "Never shown as a total. A diagnostic volume, not an opportunity." },
  identified_exposure: { label: "Identified exposure", strength: "estimated", aggregate: "location", headline: false, billable: false, said: "We can see this much, and here is how confident we are in each piece." },
  recoverable: { label: "Qualified recoverable", strength: "estimated", aggregate: "dedup", headline: false, billable: false, said: "Realistically worth going after." },
  projected: { label: "Projected impact", strength: "modelled", aggregate: false, headline: false, billable: false, said: "Could save approximately — always could, always approximate." },
  committed: { label: "Committed value", strength: "modelled", aggregate: "class", headline: "in-flight", billable: false, said: "In flight — not counted until its window closes clean." },
  measured: { label: "Measured effect", strength: "causal", aggregate: false, headline: false, billable: false, said: "What happened, not yet why." },
  causal: { label: "Causal effect", strength: "causal", aggregate: false, headline: false, billable: false, said: "Comparable services suggest at least this much is the change." },
  verified: { label: "Verified savings", strength: "bookable", aggregate: true, headline: true, billable: false, said: "Verified — and the word appears nowhere else." },
  bookable: { label: "Bookable savings", strength: "bookable", aggregate: true, headline: true, billable: true, said: "Eligible for billing at the lower bound." },
  realized: { label: "Realized savings", strength: "bookable", aggregate: true, headline: true, billable: true, said: "Banked — only this class may use that word." },
  maintained: { label: "Maintained value", strength: "bookable", aggregate: "separate", headline: "labelled", billable: "agreement", said: "Held — this standard has not slipped." },
  adjustment: { label: "Reversed or decayed", strength: "bookable", aggregate: "separate", headline: true, billable: false, said: "Shown beside verified savings, never netted into them." },
};

/** Words reserved to the bottom rows of the ladder. */
export const RESERVED_WORDS = ["banked", "realized", "recovered", "saved"] as const;
/** Words the product never uses. */
export const BANNED_WORDS = ["guaranteed", "certain", "proven"] as const;

export class Money {
  readonly cents: Cents;
  readonly klass: ClaimClass;
  readonly meta: Readonly<Record<string, unknown>>;

  constructor(cents: number, klass: ClaimClass, meta: Record<string, unknown> = {}) {
    if (!CLAIM_CLASS[klass]) throw new Error(`unknown claim class: ${String(klass)}`);
    this.cents = assertCents(cents, `Money[${klass}]`);
    this.klass = klass;
    this.meta = Object.freeze({ ...meta });
  }

  get strength(): ClaimStrength {
    return CLAIM_CLASS[this.klass].strength;
  }

  plus(other: Money): Money {
    if (!(other instanceof Money)) throw new Error("Money.plus expects Money");
    if (other.klass !== this.klass) {
      throw new Error(`CLAIM-CLASS VIOLATION: cannot add ${other.klass} to ${this.klass}`);
    }
    return new Money(this.cents + other.cents, this.klass, this.meta);
  }

  toJSON(): { cents: Cents; klass: ClaimClass } {
    return { cents: this.cents, klass: this.klass };
  }

  toString(): string {
    return `${formatUsd(this.cents)} [${this.klass}]`;
  }
}

export function sumMoney(items: readonly Money[], klass?: ClaimClass): Money {
  const k = klass ?? items[0]?.klass;
  if (!k) throw new Error("sumMoney needs a class when the list is empty");
  return items.reduce((acc, m) => {
    if (m.klass !== k) throw new Error(`CLAIM-CLASS VIOLATION in sum: ${m.klass} into ${k}`);
    return acc.plus(m);
  }, new Money(0, k));
}

/* ---------- formatting (pure, locale-independent) ------------------------- */

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** $1,234 for |x| ≥ $100, $12.34 below, unless dp is given. */
export function formatUsd(cents: number, opts: { dp?: number; sign?: boolean } = {}): string {
  const n = (cents || 0) / 100;
  const dp = opts.dp ?? (Math.abs(n) >= 100 ? 0 : 2);
  const abs = Math.abs(n).toFixed(dp);
  const [i, f] = abs.split(".");
  const body = `$${groupThousands(i ?? "0")}${f ? "." + f : ""}`;
  if (opts.sign) return (n < 0 ? "−" : "+") + body;
  return (n < 0 ? "−" : "") + body;
}

export function formatPct(x: number, dp = 1): string {
  return `${(x * 100).toFixed(dp)}%`;
}

export function formatPp(x: number, dp = 1): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(dp)}pp`;
}
