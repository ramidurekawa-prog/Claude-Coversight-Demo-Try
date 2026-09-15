/**
 * Rollups — ADR-0011: canonical rows in, the service-grain register out.
 * Pure. The database materialises the result and stamps it with the engine
 * version; the detectors and estimators read only the rollup.
 */
import type { IsoDate } from "./dates.js";
import { dayOfWeek } from "./dates.js";
import type { Cents } from "./money.js";
import { groupBy, type Daypart, type InvoiceLine, type ItemDay, type Location, type MenuItem, type Register, type ReservationDay, type RoleDef, type Service, type Shift, type Sku } from "./register.js";
import { mean, sum } from "./stats.js";

export interface CheckRow {
  id: string;
  loc: string;
  businessDate: IsoDate;
  daypart: string;
  guestCount: number;
  /** Net of comps, before tax and tip. */
  subtotalCents: Cents;
  compCents: Cents;
  voidCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  tipCents: Cents;
  totalCents: Cents;
  voided: boolean;
  serverRef: string | null;
  tableRef: string | null;
  openedAt: string;
  closedAt: string;
}

export interface OrderItemRow {
  id: string;
  checkId: string;
  loc: string;
  businessDate: IsoDate;
  daypart: string;
  menuItemId: string;
  qty: number;
  unitPriceCents: Cents;
  /** Recipe (plate) cost effective on the business date. */
  unitCostCents: Cents;
  /** Minutes from fire to ready (KDS). */
  ticketMin: number | null;
}

export interface ShiftRow {
  id: string;
  loc: string;
  businessDate: IsoDate;
  daypart: string;
  role: string;
  employeeRef: string;
  scheduledHours: number;
  clockedHours: number;
  wageRateCents: Cents;
}

export interface ReviewRow {
  id: string;
  loc: string;
  businessDate: IsoDate;
  daypart: string;
  rating: number;
  isComplaint: boolean;
}

export interface ReservationRow {
  id: string;
  loc: string;
  businessDate: IsoDate;
  daypart: string;
  booked: number;
  walkIn: number;
  quotedWaitMin: number;
  abandoned: number;
  turnedAway: number;
  constrainedShare: number;
  capacity: number;
  holiday: boolean;
}

export interface CanonicalRegister {
  locations: Location[];
  dayparts: Daypart[];
  menu: MenuItem[];
  skus: Sku[];
  roles: RoleDef[];
  checks: CheckRow[];
  orderItems: OrderItemRow[];
  shifts: ShiftRow[];
  reviews: ReviewRow[];
  reservations: ReservationRow[];
  invoices: InvoiceLine[];
}

/** Aggregate canonical rows into the service-grain register. */
export function rollupRegister(c: CanonicalRegister): Register {
  const key = (r: { loc: string; businessDate: string; daypart: string }) => `${r.loc}|${r.businessDate}|${r.daypart}`;
  const checksBy = groupBy(c.checks.filter((k) => !k.voided), key);
  const itemsBy = groupBy(c.orderItems, key);
  const shiftsBy = groupBy(c.shifts, key);
  const reviewsBy = groupBy(c.reviews, key);
  const resBy = new Map(c.reservations.map((r) => [key(r), r]));

  const services: Service[] = [];
  const itemDays: ItemDay[] = [];
  const shifts: Shift[] = [];
  const reservations: ReservationDay[] = [];

  // A service exists wherever a check, a shift or a reservation row exists.
  const keys = new Set<string>([...checksBy.keys(), ...shiftsBy.keys(), ...resBy.keys()]);
  const lastRating = new Map<string, number>();
  for (const k of [...keys].sort()) {
    const [loc, date, daypart] = k.split("|") as [string, string, string];
    const checks = checksBy.get(k) ?? [];
    const items = itemsBy.get(k) ?? [];
    const sh = shiftsBy.get(k) ?? [];
    const rv = reviewsBy.get(k) ?? [];
    const res = resBy.get(k);
    const covers = sum(checks.map((x) => x.guestCount));
    const compsCents = sum(checks.map((x) => x.compCents));
    const netCents = sum(checks.map((x) => x.subtotalCents));
    const grossCents = netCents + compsCents;
    const cogsCents = sum(items.map((i) => i.qty * i.unitCostCents));
    const laborCents = Math.round(sum(sh.map((s) => s.clockedHours * s.wageRateCents)));
    const hours = Math.round(sum(sh.map((s) => s.clockedHours)) * 4) / 4;
    const tickets = items.filter((i) => i.ticketMin != null).map((i) => i.ticketMin as number);
    const ticketMin = tickets.length ? Math.round(mean(tickets) * 10) / 10 : 0;
    const ratingKey = `${loc}|${daypart}`;
    const rating = rv.length ? Math.round(mean(rv.map((r) => r.rating)) * 100) / 100 : (lastRating.get(ratingKey) ?? 4.4);
    lastRating.set(ratingKey, rating);
    services.push({
      loc,
      date,
      dow: dayOfWeek(date),
      daypart,
      covers,
      turnedAway: res?.turnedAway ?? 0,
      grossCents,
      compsCents,
      netCents,
      cogsCents,
      laborCents,
      hours,
      ticketMin,
      rating,
      constrainedShare: res?.constrainedShare ?? 0,
      holiday: res?.holiday ?? false,
      capacity: res?.capacity ?? 0,
    });
    const byItem = groupBy(items, (i) => i.menuItemId);
    for (const [item, rows] of byItem) {
      const units = sum(rows.map((r) => r.qty));
      if (!units) continue;
      itemDays.push({ loc, date, daypart, item, units, priceCents: Math.round(sum(rows.map((r) => r.qty * r.unitPriceCents)) / units), costCents: Math.round(sum(rows.map((r) => r.qty * r.unitCostCents)) / units) });
    }
    const byRole = groupBy(sh, (s) => s.role);
    for (const [role, rows] of byRole) {
      shifts.push({ loc, date, daypart, role, scheduledHours: Math.round(sum(rows.map((r) => r.scheduledHours)) * 4) / 4, clockedHours: Math.round(sum(rows.map((r) => r.clockedHours)) * 4) / 4, rateCents: rows[0]?.wageRateCents ?? 0 });
    }
    if (res) reservations.push({ loc, date, daypart, booked: res.booked, walkIn: res.walkIn, quotedWaitMin: res.quotedWaitMin, abandoned: res.abandoned });
  }
  return { locations: c.locations, dayparts: c.dayparts, menu: c.menu, skus: c.skus, roles: c.roles, services, itemDays, shifts, invoices: c.invoices, reservations };
}
