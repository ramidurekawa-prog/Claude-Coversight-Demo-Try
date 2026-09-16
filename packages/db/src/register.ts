/**
 * The register in and out of the database. Rows are the engine's service-grain
 * shapes; location, item, SKU and role ids in the engine are the short codes.
 */
import type { Daypart, InvoiceLine, ItemDay, Location, MenuItem, Register, ReservationDay, RoleDef, Service, Shift, Sku } from "@streamline/engine";
import { and, asc, eq, gt } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { StreamlineDb } from "./repositories";
import { dayparts, invoiceLines, itemDays, locations, menuItems, reservationDays, roles, services, shifts, skus } from "./schema";

/**
 * Rows per INSERT. Stay well under Postgres' 65,535 bind-parameter limit (the
 * widest table is about 18 columns).
 *
 * Do not raise this: PGlite's WebAssembly build rejects a statement of roughly
 * 36,000 parameters, and it does so in a way that leaves the transaction's
 * earlier rows behind instead of rolling them back — a seed that half-succeeds.
 * The round trips this costs are only paid by the one-time seed.
 */
const CHUNK = 500;

export async function insertChunked<T extends PgTable>(db: StreamlineDb, table: T, rows: T["$inferInsert"][]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await db.insert(table).values(rows.slice(i, i + CHUNK));
}

export function locationFromRow(r: typeof locations.$inferSelect): Location {
  return { id: r.code, name: r.name, short: r.short, seats: r.seats, opened: r.opened, gm: r.gm, chef: r.chef, concept: r.concept };
}

export async function loadRegister(db: StreamlineDb, orgId: string): Promise<Register> {
  const [locs, dps, menu, skuRows, roleRows, sv, idays, sh, inv, res] = await Promise.all([
    db.select().from(locations).where(eq(locations.orgId, orgId)).orderBy(asc(locations.opened)),
    db.select().from(dayparts).where(eq(dayparts.orgId, orgId)).orderBy(asc(dayparts.startHour)),
    db.select().from(menuItems).where(eq(menuItems.orgId, orgId)).orderBy(asc(menuItems.code)),
    db.select().from(skus).where(eq(skus.orgId, orgId)).orderBy(asc(skus.code)),
    db.select().from(roles).where(eq(roles.orgId, orgId)).orderBy(asc(roles.code)),
    db.select().from(services).where(eq(services.orgId, orgId)).orderBy(asc(services.businessDate), asc(services.locationCode), asc(services.daypart)),
    db.select().from(itemDays).where(eq(itemDays.orgId, orgId)).orderBy(asc(itemDays.businessDate), asc(itemDays.locationCode), asc(itemDays.daypart), asc(itemDays.itemCode)),
    db.select().from(shifts).where(eq(shifts.orgId, orgId)).orderBy(asc(shifts.businessDate), asc(shifts.locationCode), asc(shifts.daypart), asc(shifts.roleCode)),
    db.select().from(invoiceLines).where(eq(invoiceLines.orgId, orgId)).orderBy(asc(invoiceLines.week), asc(invoiceLines.locationCode), asc(invoiceLines.skuCode)),
    db.select().from(reservationDays).where(eq(reservationDays.orgId, orgId)).orderBy(asc(reservationDays.businessDate), asc(reservationDays.locationCode), asc(reservationDays.daypart)),
  ]);
  return {
    locations: locs.map(locationFromRow),
    dayparts: dps.map((d): Daypart => ({ id: d.code, label: d.label, startHour: d.startHour, endHour: d.endHour, hours: d.hours })),
    menu: menu.map((m): MenuItem => ({ id: m.code, name: m.name, category: m.category, costCents: m.costCents, priceHistory: m.priceHistory, ...(m.usesSku ? { usesSku: m.usesSku } : {}) })),
    skus: skuRows.map((s): Sku => ({ id: s.code, name: s.name, vendor: s.vendor, unit: s.unit })),
    roles: roleRows.map((r): RoleDef => ({ id: r.code, label: r.label, foh: r.foh, loadedRateCents: r.loadedRateCents })),
    services: sv.map((s): Service => ({ loc: s.locationCode, date: s.businessDate, dow: s.dow, daypart: s.daypart, covers: s.covers, turnedAway: s.turnedAway, grossCents: s.grossCents, compsCents: s.compsCents, netCents: s.netCents, cogsCents: s.cogsCents, laborCents: s.laborCents, hours: s.hours, ticketMin: s.ticketMin, rating: s.rating, constrainedShare: s.constrainedShare, holiday: s.holiday, capacity: s.capacity })),
    itemDays: idays.map((r): ItemDay => ({ loc: r.locationCode, date: r.businessDate, daypart: r.daypart, item: r.itemCode, units: r.units, priceCents: r.priceCents, costCents: r.costCents })),
    shifts: sh.map((r): Shift => ({ loc: r.locationCode, date: r.businessDate, daypart: r.daypart, role: r.roleCode, scheduledHours: r.scheduledHours, clockedHours: r.clockedHours, rateCents: r.rateCents })),
    invoices: inv.map((r): InvoiceLine => ({ loc: r.locationCode, week: r.week, sku: r.skuCode, vendor: r.vendor, unitPriceCents: r.unitPriceCents, qty: r.qty, extendedCents: r.extendedCents })),
    reservations: res.map((r): ReservationDay => ({ loc: r.locationCode, date: r.businessDate, daypart: r.daypart, booked: r.booked, walkIn: r.walkIn, quotedWaitMin: r.quotedWaitMin, abandoned: r.abandoned })),
  };
}

/** Insert catalogue rows (locations excluded — they carry more than the engine's Location). */
export async function insertCatalogue(db: StreamlineDb, orgId: string, reg: Pick<Register, "dayparts" | "menu" | "skus" | "roles">): Promise<void> {
  await insertChunked(db, dayparts, reg.dayparts.map((d) => ({ orgId, code: d.id, label: d.label, startHour: d.startHour, endHour: d.endHour, hours: d.hours })));
  await insertChunked(db, menuItems, reg.menu.map((m) => ({ orgId, code: m.id, name: m.name, category: m.category, costCents: m.costCents, priceHistory: m.priceHistory, usesSku: m.usesSku ?? null })));
  await insertChunked(db, skus, reg.skus.map((s) => ({ orgId, code: s.id, name: s.name, vendor: s.vendor, unit: s.unit })));
  await insertChunked(db, roles, reg.roles.map((r) => ({ orgId, code: r.id, label: r.label, foh: r.foh, loadedRateCents: r.loadedRateCents })));
}

/** Insert register rows after `afterDate` (exclusive; null = everything). Invoice weeks after `afterWeek`. */
export async function insertRegisterRows(db: StreamlineDb, orgId: string, reg: Pick<Register, "services" | "itemDays" | "shifts" | "invoices" | "reservations">, opts: { afterDate?: string | null; afterWeek?: string | null } = {}): Promise<{ services: number; itemDays: number; shifts: number; invoices: number; reservations: number }> {
  const after = opts.afterDate ?? null;
  const afterWeek = opts.afterWeek ?? null;
  const sv = reg.services.filter((s) => !after || s.date > after);
  const idays = reg.itemDays.filter((s) => !after || s.date > after);
  const sh = reg.shifts.filter((s) => !after || s.date > after);
  const inv = reg.invoices.filter((s) => !afterWeek || s.week > afterWeek);
  const res = reg.reservations.filter((s) => !after || s.date > after);
  await insertChunked(db, services, sv.map((s) => ({ orgId, locationCode: s.loc, businessDate: s.date, dow: s.dow, daypart: s.daypart, covers: s.covers, turnedAway: s.turnedAway, grossCents: s.grossCents, compsCents: s.compsCents, netCents: s.netCents, cogsCents: s.cogsCents, laborCents: s.laborCents, hours: s.hours, ticketMin: s.ticketMin, rating: s.rating, constrainedShare: s.constrainedShare, holiday: s.holiday, capacity: s.capacity })));
  await insertChunked(db, itemDays, idays.map((r) => ({ orgId, locationCode: r.loc, businessDate: r.date, daypart: r.daypart, itemCode: r.item, units: r.units, priceCents: r.priceCents, costCents: r.costCents })));
  await insertChunked(db, shifts, sh.map((r) => ({ orgId, locationCode: r.loc, businessDate: r.date, daypart: r.daypart, roleCode: r.role, scheduledHours: r.scheduledHours, clockedHours: r.clockedHours, rateCents: r.rateCents })));
  await insertChunked(db, invoiceLines, inv.map((r) => ({ orgId, locationCode: r.loc, week: r.week, skuCode: r.sku, vendor: r.vendor, unitPriceCents: r.unitPriceCents, qty: r.qty, extendedCents: r.extendedCents })));
  await insertChunked(db, reservationDays, res.map((r) => ({ orgId, locationCode: r.loc, businessDate: r.date, daypart: r.daypart, booked: r.booked, walkIn: r.walkIn, quotedWaitMin: r.quotedWaitMin, abandoned: r.abandoned })));
  return { services: sv.length, itemDays: idays.length, shifts: sh.length, invoices: inv.length, reservations: res.length };
}

export async function lastInvoiceWeek(db: StreamlineDb, orgId: string): Promise<string | null> {
  const rows = await db.select({ week: invoiceLines.week }).from(invoiceLines).where(eq(invoiceLines.orgId, orgId));
  return rows.reduce<string | null>((m, r) => (m == null || r.week > m ? r.week : m), null);
}

export async function servicesAfter(db: StreamlineDb, orgId: string, date: string): Promise<number> {
  return (await db.select({ id: services.id }).from(services).where(and(eq(services.orgId, orgId), gt(services.businessDate, date)))).length;
}
