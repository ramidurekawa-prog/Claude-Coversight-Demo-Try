/**
 * Harbor House Group — the SECOND tenant. One room, connected nine days ago,
 * no findings, no history. It exists so the product can be shown honestly
 * empty, and so every tenancy test has a neighbour to leak from.
 */
import type { Feed, FeedHealth, Location } from "@streamline/engine";
import { addDays, daysBetween, feedHealth } from "@streamline/engine";
import { v5 as uuidv5 } from "uuid";
import { FEED_SPECS } from "./rosewood/spec";

const NAMESPACE = uuidv5("streamline.coversight/fixtures/harbor", uuidv5.URL);
export const harborId = (label: string): string => uuidv5(label, NAMESPACE);
export const HARBOR_ORG_ID = harborId("org:harbor");

export const HARBOR_ORG = {
  id: HARBOR_ORG_ID,
  name: "Harbor House Group",
  fiscalCalendar: "Calendar month, Mon–Sun weeks",
  ownerName: "Elena Marsh",
  controllerName: "Elena Marsh (owner-operator)",
  pos: "Toast",
  currency: "USD",
  feeMonthlyCents: 29900,
  feeNote: "Pilot terms: $299 per room per month.",
  asOf: "2026-09-15",
  /** Business date the POS feed was connected. Baselines need 28 days before any detector may fire. */
  connectedOn: "2026-09-06",
} as const;

export const HARBOR_LOCATIONS: Location[] = [{ id: "hh1", name: "Harbor House Sausalito", short: "Sausalito", seats: 88, opened: "2022-04-11", gm: "Elena Marsh", chef: "Nico Ferrer", concept: "Waterfront full-service" }];

export interface HarborBuild {
  org: typeof HARBOR_ORG;
  asOf: string;
  locations: Location[];
  feeds: FeedHealth[];
  /** Days of register delivered so far, and the days a baseline needs. */
  baseline: { deliveredDays: number; requiredDays: number };
}

export function buildHarbor(opts: { asOf?: string } = {}): HarborBuild {
  const asOf = opts.asOf ?? HARBOR_ORG.asOf;
  const delivered = Math.max(0, daysBetween(HARBOR_ORG.connectedOn, asOf));
  const feeds: Feed[] = FEED_SPECS.map((f) => {
    const connected = f.id === "toast_orders" || f.id === "toast_labour" || f.id === "auth";
    return {
      id: f.id,
      name: f.name,
      tier: f.tier,
      access: f.access,
      cadence: f.cadence,
      slaHours: f.slaHours,
      fields: f.fields,
      stages: f.stages,
      newest: connected ? addDays(asOf, -1) : null,
      rows: connected ? delivered * 40 : 0,
      degraded: f.degraded,
      completeness: connected ? 1 : 0,
    };
  });
  return { org: HARBOR_ORG, asOf, locations: HARBOR_LOCATIONS, feeds: feeds.map((f) => feedHealth(f, asOf, daysBetween)), baseline: { deliveredDays: delivered, requiredDays: 28 } };
}
