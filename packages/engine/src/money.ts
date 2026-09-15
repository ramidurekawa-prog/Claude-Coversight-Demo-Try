/** Integer cents, always. A fractional cent is an error, not a rounding detail. */
export type Cents = number;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isInteger(value)) throw new Error(`${label} must be integer cents, got ${value}`);
  return value;
}
