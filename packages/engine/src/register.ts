/**
 * The canonical register: what a restaurant's own systems record, in integer
 * cents and location-local business dates. The engine reads these rows and
 * nothing else.
 */
import type { IsoDate } from "./dates.js";
import type { Cents } from "./money.js";

export type LocationId = string;
export type DaypartId = string;
export type MenuItemId = string;
export type SkuId = string;
export type RoleId = string;

export interface Location {
  id: LocationId;
  name: string;
  short: string;
  seats: number;
  opened: IsoDate;
  gm: string;
  chef: string;
  concept: string;
}

export interface Daypart {
  id: DaypartId;
  label: string;
  startHour: number;
  endHour: number;
  hours: number;
}

export interface MenuItem {
  id: MenuItemId;
  name: string;
  category: string;
  /** Current recipe (plate) cost in cents; null when no recipe file exists. */
  costCents: Cents | null;
  /** [effective date, price cents] ascending. */
  priceHistory: Array<[IsoDate, Cents]>;
  /** Recipe → SKU join for the theoretical-usage detector. */
  usesSku?: { sku: SkuId; qtyPerUnit: number };
}

export interface Sku {
  id: SkuId;
  name: string;
  vendor: string;
  unit: string;
}

export interface RoleDef {
  id: RoleId;
  label: string;
  foh: boolean;
  /** Loaded hourly rate in cents (wage × burden). */
  loadedRateCents: Cents;
}

/** One daypart, at one location, on one date. The atomic unit of comparison. */
export interface Service {
  loc: LocationId;
  date: IsoDate;
  dow: number;
  daypart: DaypartId;
  covers: number;
  turnedAway: number;
  grossCents: Cents;
  compsCents: Cents;
  netCents: Cents;
  cogsCents: Cents;
  laborCents: Cents;
  hours: number;
  ticketMin: number;
  rating: number;
  constrainedShare: number;
  holiday: boolean;
  capacity: number;
}

export interface ItemDay {
  loc: LocationId;
  date: IsoDate;
  daypart: DaypartId;
  item: MenuItemId;
  units: number;
  priceCents: Cents;
  costCents: Cents;
}

export interface Shift {
  loc: LocationId;
  date: IsoDate;
  daypart: DaypartId;
  role: RoleId;
  scheduledHours: number;
  clockedHours: number;
  rateCents: Cents;
}

export interface InvoiceLine {
  loc: LocationId;
  /** Monday of the delivery week. */
  week: IsoDate;
  sku: SkuId;
  vendor: string;
  unitPriceCents: Cents;
  qty: number;
  extendedCents: Cents;
}

export interface ReservationDay {
  loc: LocationId;
  date: IsoDate;
  daypart: DaypartId;
  booked: number;
  walkIn: number;
  quotedWaitMin: number;
  abandoned: number;
}

export interface Register {
  locations: Location[];
  dayparts: Daypart[];
  menu: MenuItem[];
  skus: Sku[];
  roles: RoleDef[];
  services: Service[];
  itemDays: ItemDay[];
  shifts: Shift[];
  invoices: InvoiceLine[];
  reservations: ReservationDay[];
}

/** A data feed and its health, derived from delivered data (Doctrine 11). */
export interface Feed {
  id: string;
  name: string;
  tier: "Pilot" | "Next" | "Later";
  access: string;
  cadence: string;
  slaHours: number | null;
  fields: string;
  stages: string;
  /** Newest business date delivered by this source. */
  newest: IsoDate | null;
  rows: number;
  degraded: string;
  /** Rows delivered ÷ rows expected at the feed's own grain. */
  completeness: number;
}

export interface FeedHealth extends Feed {
  ageDays: number | null;
  stale: boolean;
}

export function feedHealth(feed: Feed, asOf: IsoDate, daysBetween: (a: IsoDate, b: IsoDate) => number): FeedHealth {
  const ageDays = feed.newest ? daysBetween(feed.newest, asOf) : null;
  const stale = feed.slaHours != null && ageDays != null && ageDays * 24 > feed.slaHours;
  return { ...feed, ageDays, stale };
}

/* ---------- small indexing helpers --------------------------------------- */

export function groupBy<T>(arr: readonly T[], keyFn: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of arr) {
    const k = keyFn(r);
    const bucket = m.get(k);
    if (bucket) bucket.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export function menuById(reg: Register): Map<MenuItemId, MenuItem> {
  return new Map(reg.menu.map((m) => [m.id, m]));
}
export function skuById(reg: Register): Map<SkuId, Sku> {
  return new Map(reg.skus.map((s) => [s.id, s]));
}
export function locationById(reg: Register): Map<LocationId, Location> {
  return new Map(reg.locations.map((l) => [l.id, l]));
}
export function daypartById(reg: Register): Map<DaypartId, Daypart> {
  return new Map(reg.dayparts.map((d) => [d.id, d]));
}

export function priceOn(item: MenuItem, date: IsoDate): Cents {
  let p = item.priceHistory[0]?.[1] ?? 0;
  for (const [d, v] of item.priceHistory) if (d <= date) p = v;
  return p;
}
