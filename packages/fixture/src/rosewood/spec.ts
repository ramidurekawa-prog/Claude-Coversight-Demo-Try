/**
 * Rosewood Group — the synthetic demo operator. Three full-service rooms in
 * the East Bay, 52 weeks of register history. Every value here is frozen; the
 * dataset is a deterministic function of these constants and the seed.
 *
 * Signals are PLANTED here, not in the detectors. The detectors are not told
 * about any of them.
 */
import type { Daypart, Location, MenuItem, RoleDef, Sku } from "@streamline/engine";
import { v5 as uuidv5 } from "uuid";

export const FIXTURE = {
  seed: "rosewood-v5",
  version: "1.0.0",
  label: "Sample restaurant group · deterministic synthetic data",
  note: "Three full-service rooms, 52 weeks of service-level records generated from a fixed seed. Nothing here is connected to a live POS, scheduling, accounting or purchasing system.",
} as const;

const NAMESPACE = uuidv5("streamline.coversight/fixtures/rosewood", uuidv5.URL);
export const rosewoodId = (label: string): string => uuidv5(label, NAMESPACE);

export const ROSEWOOD_ORG_ID = rosewoodId("org:rosewood");

export const ORG = {
  id: ROSEWOOD_ORG_ID,
  name: "Rosewood Group",
  fiscalCalendar: "Calendar month, Mon–Sun weeks",
  ownerName: "Rose Jorge",
  controllerName: "Dana Whitfield (group controller)",
  pos: "Toast",
  currency: "USD",
  /** $299 per room per month, pilot terms. */
  feeMonthlyCents: 89700,
  feeNote: "Pilot terms: $299 per room per month, no success fee until the verified value multiple clears 3×.",
  asOf: "2026-09-15",
} as const;

export const LOCATIONS: Array<Location & { volumeIndex: number; tz: string; address: string }> = [
  { id: "oak", name: "Rosewood Oakland", short: "Oakland", seats: 150, opened: "2019-03-04", gm: "Maria Reyes", chef: "Theo Alvarez", concept: "Californian full-service", volumeIndex: 1.0, tz: "America/Los_Angeles", address: "4801 Telegraph Ave, Oakland, CA 94609" },
  { id: "brk", name: "Rosewood Berkeley", short: "Berkeley", seats: 110, opened: "2021-08-19", gm: "Sam Okafor", chef: "Jun Watanabe", concept: "Californian full-service", volumeIndex: 0.74, tz: "America/Los_Angeles", address: "2120 Shattuck Ave, Berkeley, CA 94704" },
  { id: "ala", name: "Rosewood Alameda", short: "Alameda", seats: 95, opened: "2023-05-30", gm: "Priya Raman", chef: "Theo Alvarez", concept: "Californian full-service", volumeIndex: 0.61, tz: "America/Los_Angeles", address: "1512 Park St, Alameda, CA 94501" },
];

export const DAYPARTS: Daypart[] = [
  { id: "lunch", label: "Lunch", startHour: 11, endHour: 15, hours: 4 },
  { id: "dinner", label: "Dinner", startHour: 17, endHour: 22, hours: 5 },
];

/** Menu: price history carries the changes the elasticity estimator needs (B6 refuses on fewer than 3 distinct prices). */
export interface MenuSpec extends MenuItem {
  popIdx: number;
  elasticity: number;
  /** Chicken plates draw on sk01; potatoes on sk06 — the recipe → SKU join D3/G10 needs. */
  usesSku?: { sku: string; qtyPerUnit: number };
}

export const MENU: MenuSpec[] = [
  { id: "m01", name: "Cast-Iron Half Chicken", category: "Mains", costCents: 1015, popIdx: 1.0, elasticity: -1.42, priceHistory: [["2025-09-15", 2900], ["2026-01-05", 3050], ["2026-05-11", 3200]], usesSku: { sku: "sk01", qtyPerUnit: 1.35 } },
  { id: "m02", name: "Grilled Chicken Salad", category: "Mains", costCents: 742, popIdx: 0.78, elasticity: -1.71, priceHistory: [["2025-09-15", 2200], ["2026-02-16", 2300], ["2026-06-08", 2400]], usesSku: { sku: "sk01", qtyPerUnit: 0.42 } },
  { id: "m03", name: "Dry-Aged Burger", category: "Mains", costCents: 961, popIdx: 1.24, elasticity: -1.15, priceHistory: [["2025-09-15", 2400], ["2026-01-05", 2500], ["2026-05-11", 2600]], usesSku: { sku: "sk06", qtyPerUnit: 0.4 } },
  { id: "m04", name: "Wood-Grilled Salmon", category: "Mains", costCents: 1428, popIdx: 0.63, elasticity: -0.88, priceHistory: [["2025-09-15", 3200], ["2026-03-02", 3400]] },
  { id: "m05", name: "Cacio e Pepe", category: "Mains", costCents: 462, popIdx: 0.71, elasticity: -1.63, priceHistory: [["2025-09-15", 1950], ["2025-12-01", 2050], ["2026-04-06", 2200]] },
  { id: "m06", name: "Market Fish", category: "Mains", costCents: 1584, popIdx: 0.34, elasticity: -0.71, priceHistory: [["2025-09-15", 3500], ["2026-03-02", 3600]] },
  { id: "m07", name: "Short Rib", category: "Mains", costCents: 1634, popIdx: 0.41, elasticity: -0.94, priceHistory: [["2025-09-15", 3600], ["2026-01-05", 3700], ["2026-05-11", 3800]], usesSku: { sku: "sk06", qtyPerUnit: 0.35 } },
  { id: "m08", name: "Mushroom Risotto", category: "Mains", costCents: 675, popIdx: 0.37, elasticity: -1.34, priceHistory: [["2025-09-15", 2300], ["2026-02-16", 2400], ["2026-06-08", 2500]] },
  { id: "m09", name: "Little Gem Salad", category: "Starters", costCents: 390, popIdx: 0.88, elasticity: -1.52, priceHistory: [["2025-09-15", 1400], ["2026-01-05", 1450], ["2026-05-11", 1500]] },
  { id: "m10", name: "Wood-Fired Bread", category: "Starters", costCents: 171, popIdx: 1.42, elasticity: -0.96, priceHistory: [["2025-09-15", 800], ["2026-02-16", 850], ["2026-06-08", 900]] },
  { id: "m11", name: "Oysters (half dozen)", category: "Starters", costCents: 1050, popIdx: 0.46, elasticity: -1.19, priceHistory: [["2025-09-15", 1950], ["2026-03-02", 2100]] },
  { id: "m12", name: "Crispy Potatoes", category: "Sides", costCents: 242, popIdx: 1.09, elasticity: -1.28, priceHistory: [["2025-09-15", 950], ["2025-12-01", 1000], ["2026-04-06", 1100]], usesSku: { sku: "sk06", qtyPerUnit: 0.55 } },
  { id: "m13", name: "Charred Broccolini", category: "Sides", costCents: 336, popIdx: 0.52, elasticity: -1.44, priceHistory: [["2025-09-15", 1100], ["2026-02-16", 1150], ["2026-06-08", 1200]] },
  { id: "m14", name: "Chicken Thigh Skewers", category: "Starters", costCents: 528, popIdx: 0.59, elasticity: -1.56, priceHistory: [["2025-09-15", 1450], ["2026-01-05", 1500], ["2026-05-11", 1600]], usesSku: { sku: "sk01", qtyPerUnit: 0.38 } },
  { id: "m15", name: "Olive Oil Cake", category: "Desserts", costCents: 228, popIdx: 0.48, elasticity: -1.37, priceHistory: [["2025-09-15", 1100], ["2026-04-06", 1200]] },
  { id: "m16", name: "Affogato", category: "Desserts", costCents: 230, popIdx: 0.35, elasticity: -1.22, priceHistory: [["2025-09-15", 900], ["2026-04-06", 1000]] },
  { id: "m17", name: "House Red (glass)", category: "Beverage", costCents: 432, popIdx: 1.31, elasticity: -1.08, priceHistory: [["2025-09-15", 1500], ["2026-01-05", 1550], ["2026-05-11", 1600]] },
  { id: "m18", name: "Zero-Proof Spritz", category: "Beverage", costCents: 264, popIdx: 0.44, elasticity: -1.49, priceHistory: [["2025-09-15", 1100], ["2026-02-16", 1150], ["2026-06-08", 1200]] },
];

export interface SkuSpec extends Sku {
  baseCents: number;
  /** Tracked-SKU consumption per cover, in the SKU's own unit; absent when derived from the recipe join. */
  perCover?: number;
  fromRecipe?: boolean;
}

export const SKUS: SkuSpec[] = [
  { id: "sk01", name: "Chicken thigh, boneless", vendor: "Bay Provisions", unit: "lb", baseCents: 305, fromRecipe: true },
  { id: "sk02", name: "Ground chuck 80/20", vendor: "Bay Provisions", unit: "lb", baseCents: 589, perCover: 0.08 },
  { id: "sk03", name: "Salmon fillet", vendor: "Pacific Coast", unit: "lb", baseCents: 1340, perCover: 0.035 },
  { id: "sk04", name: "Short rib, bone-in", vendor: "Bay Provisions", unit: "lb", baseCents: 1080, perCover: 0.03 },
  { id: "sk05", name: "Pecorino Romano", vendor: "Ferrante Foods", unit: "lb", baseCents: 1420, perCover: 0.008 },
  { id: "sk06", name: "Yukon gold potatoes", vendor: "Valley Greens", unit: "lb", baseCents: 118, fromRecipe: true },
  { id: "sk07", name: "Little gem lettuce", vendor: "Valley Greens", unit: "cs", baseCents: 3450, perCover: 0.004 },
  { id: "sk08", name: "Broccolini", vendor: "Valley Greens", unit: "cs", baseCents: 4180, perCover: 0.0025 },
  { id: "sk09", name: "Extra-virgin olive oil", vendor: "Ferrante Foods", unit: "gal", baseCents: 5290, perCover: 0.0012 },
  { id: "sk10", name: "Oysters, Kumamoto", vendor: "Pacific Coast", unit: "dz", baseCents: 1880, perCover: 0.015 },
  { id: "sk11", name: "Butter, unsalted", vendor: "Ferrante Foods", unit: "lb", baseCents: 412, perCover: 0.02 },
  { id: "sk12", name: "Flour, bread", vendor: "Ferrante Foods", unit: "lb", baseCents: 96, perCover: 0.04 },
];

export const ROLES: Array<RoleDef & { baseRateCents: number; burden: number }> = [
  { id: "server", label: "Server", foh: true, baseRateCents: 1980, burden: 1.22, loadedRateCents: Math.round(1980 * 1.22) },
  { id: "busser", label: "Busser", foh: true, baseRateCents: 1820, burden: 1.22, loadedRateCents: Math.round(1820 * 1.22) },
  { id: "host", label: "Host", foh: true, baseRateCents: 1900, burden: 1.22, loadedRateCents: Math.round(1900 * 1.22) },
  { id: "bar", label: "Bartender", foh: true, baseRateCents: 2150, burden: 1.22, loadedRateCents: Math.round(2150 * 1.22) },
  { id: "line", label: "Line cook", foh: false, baseRateCents: 2340, burden: 1.24, loadedRateCents: Math.round(2340 * 1.24) },
  { id: "prep", label: "Prep cook", foh: false, baseRateCents: 2050, burden: 1.24, loadedRateCents: Math.round(2050 * 1.24) },
  { id: "dish", label: "Dishwasher", foh: false, baseRateCents: 1880, burden: 1.24, loadedRateCents: Math.round(1880 * 1.24) },
];

/* ---------- planted signals ------------------------------------------------ */

export const START: string = "2025-09-15";
/** Last complete business date at the fixture's "today". */
export const END: string = "2026-09-14";

export const HOLIDAYS = ["2025-11-27", "2025-12-24", "2025-12-25", "2026-01-01", "2026-05-25", "2026-07-04", "2026-09-07"];
export const CLOSURES: Array<{ loc: string; dates: string[]; reason: string }> = [{ loc: "brk", dates: ["2026-02-09", "2026-02-10"], reason: "Kitchen hood repair" }];

export const SIGNALS = {
  /** 1. Vendor raised the chicken thigh price. Group-wide, one step, no negotiation. */
  chickenPriceStep: { sku: "sk01", from: "2026-07-06", mult: 1.141 },
  /** 2. Portion drift on the chicken plates at Berkeley — new line cook, no scale. */
  portionDrift: { loc: "brk", from: "2026-07-13", overPour: 0.235 },
  /** 3. Tuesday dinner at Oakland carries hours the room does not need, spread the way real overstaffing is. */
  tuesdayOverstaff: { loc: "oak", dow: 2, daypart: "dinner", from: "2026-06-22", excess: { server: 6.5, busser: 3.0, line: 4.5, host: 2.0 } as Record<string, number> },
  /** 4. Comps & voids at Berkeley lunch ran hot, then were fixed in June. */
  compsSpike: { loc: "brk", daypart: "lunch", from: "2026-03-02", to: "2026-06-15", add: 0.026 },
  /** ...and one nobody has fixed yet. */
  compsLive: { loc: "oak", daypart: "dinner", from: "2026-08-10", to: "2099-01-01", add: 0.016 },
  /** Alameda dinner comps fall in April. It measures as a clean win — and is not one: a manager started coding the same write-offs as discounts. */
  compsRecode: { loc: "ala", daypart: "dinner", from: "2026-04-13", to: "2099-01-01", add: -0.017 },
  /** 5. Mix drifting away from the high-CM pasta at Alameda. */
  mixDrift: { loc: "ala", item: "m05", from: "2026-07-13", shareDelta: -0.085 },
  /** 6. Ticket times creeping at Alameda dinner. */
  ticketCreep: { loc: "ala", daypart: "dinner", from: "2026-07-27", addMin: 3.4 },
  /** 7. Oakland Fri/Sat dinner genuinely runs out of room. Berkeley does not. */
  constrained: { oak: 0.31, brk: 0.02, ala: 0.06 } as Record<string, number>,
  /** Oakland over-portions potatoes (a usage ratio above the recipe card). */
  potatoOverPortion: { loc: "oak", ratio: 1.2 },
} as const;

/** Executed interventions whose effects are REAL in the register. */
export const FIXES = {
  comps: { id: "fix_comps", loc: "brk", daypart: "lunch", from: "2026-06-15", size: -0.026 },
  chuck: { id: "fix_chuck", sku: "sk02", from: "2026-06-01", mult: 0.912 },
  /** The fry-station scale: potato usage ratio falls, then drifts back (half-life 30 days). */
  fries: { id: "fix_fries", loc: "oak", sku: "sk06", from: "2026-04-20", size: -0.17, halfLifeDays: 30 },
  /** The Alameda dinner cut that slowed the room — the guardrail breach. */
  alaLabour: { id: "fix_ala_labour", loc: "ala", daypart: "dinner", from: "2026-07-20", serverHours: -2.8, ticketAddMin: 4.2, ratingDrop: 0.31 },
  brkTicket: { id: "fix_brk_ticket", loc: "brk", daypart: "dinner", from: "2026-06-29", ticketAddMin: -0.9 },
  /** The true null: the prep list moved and nothing moved. */
  alaPrep: { id: "fix_ala_prep", loc: "ala", from: "2026-07-06", size: 0 },
  /** A labour cut at Berkeley dinner that holds. */
  brkLabour: { id: "fix_brk_labour", loc: "brk", daypart: "dinner", from: "2026-07-27", serverHours: -3.1 },
  /** The one still inside its measurement window. */
  oakTue: { id: "fix_oak_tue", loc: "oak", dow: 2, daypart: "dinner", from: "2026-09-08", removeShare: 0.75 },
} as const;

/** Feed catalogue (Doctrine 11) — freshness is derived from delivered data at build time. */
export const FEED_SPECS = [
  { id: "toast_orders", name: "Toast — orders", tier: "Pilot", access: "Read", cadence: "Hourly", slaHours: 36, fields: "checks, selections, discounts, voids, comps, guest counts, business date, table sessions", stages: "1, 2, 8, 9 for every revenue lever", degraded: "Everything stops. This is the only feed with no degraded mode.", completeness: 0.998 },
  { id: "toast_labour", name: "Toast — labour", tier: "Pilot", access: "Read", cadence: "Hourly", slaHours: 36, fields: "shifts, time entries, roles, wage rates", stages: "1, 2, 8, 9 for labour and hybrid levers; stage 7 evidence", degraded: "Labour levers become undetectable; existing labour verifications stop accruing.", completeness: 0.996 },
  { id: "recipes", name: "Recipe-cost CSV", tier: "Pilot", access: "Read", cadence: "On upload", slaHours: 168, fields: "item, unit cost, effective date, yield", stages: "1, 2, 9 for every food-cost lever", degraded: "Menu dollars fall back to price-only and say so; no food-cost lever may verify.", completeness: 0.941 },
  { id: "invoices", name: "Invoices", tier: "Next", access: "Read", cadence: "Weekly", slaHours: 336, fields: "vendor, SKU, quantity, unit price, date", stages: "1, 2, 9 — the purchasing lever", degraded: "No purchasing detector can run; the second-largest real lever stays dark.", completeness: 0.982 },
  { id: "auth", name: "Auth & tenancy", tier: "Pilot", access: "—", cadence: "—", slaHours: null, fields: "org, location, user, role, invitation", stages: "All", degraded: "There is no product.", completeness: 1.0 },
  { id: "scheduling", name: "Scheduling — 7shifts", tier: "Next", access: "Draft, then write", cadence: "Hourly", slaHours: 36, fields: "published schedule, shift edits, approvals", stages: "4, 6, 7 — drafting, write-back, confirmation", degraded: "Labour actions stay at autonomy A1: recommended, never drafted.", completeness: 0.973 },
  { id: "kds", name: "KDS", tier: "Next", access: "Read", cadence: "Daily", slaHours: 48, fields: "ticket start, fire, ready, delivered", stages: "1 and 9 for ticket-time levers", degraded: "Ticket-time findings degrade to modelled and cannot verify.", completeness: 0.932 },
  { id: "reservations", name: "Reservations / host", tier: "Next", access: "Read", cadence: "Daily", slaHours: 24, fields: "bookings, seatings, quoted waits, abandonment", stages: "9 for throughput — the unmet-demand bound", degraded: "Throughput value is honestly zero, and the product says so.", completeness: 0.714 },
  { id: "reviews", name: "Reviews", tier: "Next", access: "Read", cadence: "Daily", slaHours: 72, fields: "rating, date, text", stages: "10 — a guardrail on every service-affecting lever", degraded: "Service-quality guardrails fall back to ticket time and comps.", completeness: 0.887 },
  { id: "accounting", name: "QuickBooks Online", tier: "Next", access: "Read", cadence: "Daily", slaHours: 48, fields: "chart of accounts, journals, period status, P&L", stages: "12 — the bridge", degraded: "Nothing reconciles; every claim caps at operationally verified.", completeness: 0.879 },
] as const;

/** Deliberately stale feeds at the fixture's today: newest business date delivered. */
export const FEED_STALENESS: Record<string, string | "pos" | "today" | "yesterday" | "two_days"> = {
  toast_orders: "pos",
  toast_labour: "pos",
  recipes: "2026-09-10",
  invoices: "pos",
  auth: "today",
  scheduling: "yesterday",
  kds: "pos",
  reservations: "2026-09-05", // ← deliberately stale: 10 days
  reviews: "two_days",
  accounting: "2026-08-31",
};
