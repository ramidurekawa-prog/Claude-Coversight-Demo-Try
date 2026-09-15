/**
 * A stable fingerprint of the built register, so a change to the generator is
 * caught by a test and paired with a FIXTURE.version bump — never silent.
 */
import type { Register } from "@streamline/engine";
import { seedFromLabel } from "./rng";

export function registerFingerprint(reg: Register): string {
  const parts: string[] = [];
  for (const s of reg.services) parts.push(`${s.loc}|${s.date}|${s.daypart}|${s.covers}|${s.netCents}|${s.compsCents}|${s.laborCents}|${s.cogsCents}|${s.ticketMin ?? ""}`);
  for (const i of reg.invoices) parts.push(`${i.loc}|${i.week}|${i.sku}|${i.qty}|${i.unitPriceCents}`);
  parts.sort();
  let h = 0;
  for (const p of parts) h = (Math.imul(h, 31) + seedFromLabel(p)) >>> 0;
  return `${reg.services.length}-${reg.invoices.length}-${h.toString(16)}`;
}
