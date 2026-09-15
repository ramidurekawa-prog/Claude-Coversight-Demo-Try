/**
 * Business dates as ISO strings (YYYY-MM-DD), location-local. The engine never
 * touches a clock or a Date object: "today" is always an argument (asOf).
 * Day arithmetic uses the proleptic Gregorian civil-day algorithms.
 */

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertIsoDate(s: string): IsoDate {
  if (!ISO.test(s)) throw new Error(`not an ISO date: ${s}`);
  return s;
}

/** Days since 1970-01-01 for a civil date. */
export function toDayNumber(iso: IsoDate): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(z: number): IsoDate {
  z += 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const yy = y + (m <= 2 ? 1 : 0);
  return `${String(yy).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(iso) + n);
}

/** b − a in days. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: IsoDate): number {
  const n = toDayNumber(iso);
  return ((n % 7) + 11) % 7; // 1970-01-01 was a Thursday (4)
}

export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Monday of the ISO week containing the date. */
export function weekOf(iso: IsoDate): IsoDate {
  const off = (dayOfWeek(iso) + 6) % 7;
  return addDays(iso, -off);
}

export function monthOf(iso: IsoDate): string {
  return iso.slice(0, 7);
}

export function dayOfYear(iso: IsoDate): number {
  return toDayNumber(iso) - toDayNumber(`${iso.slice(0, 4)}-01-01`) + 1;
}

export function yearOf(iso: IsoDate): number {
  return Number(iso.slice(0, 4));
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(yyyyMm: string): number {
  const y = Number(yyyyMm.slice(0, 4));
  const m = Number(yyyyMm.slice(5, 7));
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 30;
}

/** "8 Sep" */
export function formatDate(iso: IsoDate | null | undefined): string {
  if (!iso || !ISO.test(iso)) return "—";
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** "8 Sep 2026" */
export function formatDateYear(iso: IsoDate | null | undefined): string {
  if (!iso || !ISO.test(iso)) return "—";
  return `${formatDate(iso)} ${iso.slice(0, 4)}`;
}

/** "September 2026" */
export function formatMonthLong(yyyyMm: string): string {
  const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${LONG[Number(yyyyMm.slice(5, 7)) - 1]} ${yyyyMm.slice(0, 4)}`;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}
export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}
