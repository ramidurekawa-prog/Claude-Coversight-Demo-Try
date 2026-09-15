/**
 * The Rosewood register generator. Emits canonical rows (checks, order lines,
 * shifts, reviews, reservations, invoices, recipe costs); the engine's rollup
 * turns them into the service-grain register the detectors read.
 *
 * Determinism: every row is a function of (seed, its own key). Extending the
 * register through a later date never changes an earlier row, which is what
 * lets the demo clock advance without rewriting history.
 */
import type { AppliedChange, CanonicalRegister, CheckRow, Feed, InvoiceLine, IsoDate, MenuItem, OrderItemRow, ReservationRow, ReviewRow, ShiftRow } from "@streamline/engine";
import { addDays, dayOfWeek, daysBetween, priceOn, weekOf } from "@streamline/engine";
import { rngFor } from "../rng";
import { CLOSURES, DAYPARTS, END, FEED_SPECS, FEED_STALENESS, FIXES, FIXTURE, HOLIDAYS, LOCATIONS, MENU, ROLES, SIGNALS, SKUS, START } from "./spec";

export interface RecipeCostRow {
  menuItemId: string;
  effectiveOn: IsoDate;
  costCents: number;
  source: "csv" | "manual";
}

export interface RosewoodCanonical extends CanonicalRegister {
  recipeCosts: RecipeCostRow[];
  feeds: Feed[];
  through: IsoDate;
}

export interface GenerateOptions {
  /** Last complete business date to generate (default: the fixture's END). */
  through?: IsoDate;
  /** Changes executed by the operator inside the product, applied from their date. */
  appliedChanges?: AppliedChange[];
}

const DOW_FACTOR: Record<string, number[]> = { lunch: [0.86, 0.72, 0.78, 0.83, 0.9, 1.06, 1.18], dinner: [0.94, 0.61, 0.69, 0.79, 0.94, 1.34, 1.42] };
const EXTRA_HOLIDAYS = ["2026-11-26", "2026-12-24", "2026-12-25", "2027-01-01", "2027-05-31", "2027-07-05"];

function seasonality(date: IsoDate): number {
  const doy = daysBetween(`${date.slice(0, 4)}-01-01`, date) + 1;
  return 1 + 0.085 * Math.sin((2 * Math.PI * (doy - 96)) / 365) + 0.04 * Math.sin((4 * Math.PI * (doy - 20)) / 365);
}

const CHICKEN_SKU = SKUS.find((s) => s.id === "sk01")!;

/** Recipe cost effective on a date: base, plus the vendor step passed through to chicken plates. */
export function recipeCostOn(item: (typeof MENU)[number], date: IsoDate): number {
  let cost = item.costCents ?? 0;
  if (item.usesSku?.sku === "sk01" && date >= SIGNALS.chickenPriceStep.from) {
    const component = Math.round(item.usesSku.qtyPerUnit * CHICKEN_SKU.baseCents);
    cost = cost - component + Math.round(component * SIGNALS.chickenPriceStep.mult);
  }
  return cost;
}

export function buildRecipeCosts(through: IsoDate): RecipeCostRow[] {
  const rows: RecipeCostRow[] = [];
  for (const m of MENU) {
    rows.push({ menuItemId: m.id, effectiveOn: START, costCents: m.costCents ?? 0, source: "csv" });
    if (m.usesSku?.sku === "sk01" && SIGNALS.chickenPriceStep.from <= through) rows.push({ menuItemId: m.id, effectiveOn: SIGNALS.chickenPriceStep.from, costCents: recipeCostOn(m, SIGNALS.chickenPriceStep.from), source: "csv" });
  }
  return rows;
}

function roundQuarter(h: number): number {
  return Math.round(h * 4) / 4;
}

/** Split `total` integer units into `n` non-negative parts by weights, exactly. */
function splitInt(total: number, weights: number[]): number[] {
  const w = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (w <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((x) => (total * x) / w);
  const floors = raw.map(Math.floor);
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (rem <= 0) break;
    floors[i]! += 1;
    rem--;
  }
  return floors;
}

export function generateCanonical(opts: GenerateOptions = {}): RosewoodCanonical {
  const through = opts.through ?? END;
  const applied = opts.appliedChanges ?? [];
  const seed = FIXTURE.seed;
  const menu: MenuItem[] = MENU.map((m) => ({ id: m.id, name: m.name, category: m.category, costCents: m.costCents, priceHistory: m.priceHistory, usesSku: m.usesSku }));
  const holidays = new Set([...HOLIDAYS, ...EXTRA_HOLIDAYS]);

  const checks: CheckRow[] = [];
  const orderItems: OrderItemRow[] = [];
  const shifts: ShiftRow[] = [];
  const reviews: ReviewRow[] = [];
  const reservations: ReservationRow[] = [];
  const invoices: InvoiceLine[] = [];

  // Per (loc, week) theoretical usage of recipe-linked SKUs, accumulated as services are generated.
  const theoretical = new Map<string, number>(); // `${loc}|${week}|${sku}`
  const weekCovers = new Map<string, number>(); // `${loc}|${week}`
  const addTheo = (loc: string, week: string, sku: string, qty: number) => theoretical.set(`${loc}|${week}|${sku}`, (theoretical.get(`${loc}|${week}|${sku}`) ?? 0) + qty);

  const nDays = daysBetween(START, through) + 1;
  for (let i = 0; i < nDays; i++) {
    const date = addDays(START, i);
    const dow = dayOfWeek(date);
    const holiday = holidays.has(date);
    const season = seasonality(date);
    const week = weekOf(date);

    // Group-wide weekly drivers, shared by every room: the weather, a promotion, what the
    // market had that week. They are what make one room a usable control for another.
    const wk = rngFor(seed, "week", week);
    const demandShock = 1 + wk.norm(0, 0.045);
    const compsShock = wk.norm(0, 0.002);
    const popShock: Record<string, number> = {};
    for (const m of MENU) popShock[m.id] = Math.exp(rngFor(seed, "pop", m.id, week).norm(0, 0.11));

    for (const L of LOCATIONS) {
      if (CLOSURES.some((c) => c.loc === L.id && c.dates.includes(date))) continue;
      for (const dp of DAYPARTS) {
        const rng = rngFor(seed, L.id, date, dp.id);
        const base = (dp.id === "lunch" ? 78 : 132) * L.volumeIndex;
        let coversF = base * (DOW_FACTOR[dp.id] as number[])[dow]! * season * demandShock * (holiday ? 0.42 : 1) * (1 + rng.norm(0, 0.085));
        const cap = L.seats * (dp.id === "dinner" ? 1.9 : 1.35);
        const wanted = coversF;
        coversF = Math.min(coversF, cap);
        const turnedAway = Math.max(0, wanted - coversF);
        const covers = Math.max(4, Math.round(coversF));

        // ---- item mix: demand responds to each item's own price with its own elasticity ----
        const popBase: Record<string, number> = {};
        const popPriced: Record<string, number> = {};
        let baseSum = 0;
        let pricedSum = 0;
        const priceOf: Record<string, number> = {};
        for (const m of MENU) {
          let b = m.popIdx * (popShock[m.id] as number);
          if (m.category === "Beverage" && dp.id === "lunch") b *= 0.55;
          if (m.category === "Desserts" && dp.id === "lunch") b *= 0.48;
          if (SIGNALS.mixDrift.loc === L.id && m.id === SIGNALS.mixDrift.item && date >= SIGNALS.mixDrift.from) {
            const wks = daysBetween(SIGNALS.mixDrift.from, date) / 7;
            b *= Math.max(0.3, 1 + ((SIGNALS.mixDrift.shareDelta / m.popIdx) * 7) * Math.min(1, wks / 8));
          }
          popBase[m.id] = b;
          baseSum += b;
          let price = priceOn(m, date);
          for (const ch of applied) if (ch.kind === "price" && ch.item === m.id && (!ch.loc || ch.loc === L.id) && date >= ch.from) price = ch.value;
          priceOf[m.id] = price;
          const p = b * (1 + rng.norm(0, 0.14)) * Math.pow(price / (m.priceHistory[0]?.[1] ?? price), m.elasticity);
          popPriced[m.id] = Math.max(0.01, p);
          pricedSum += popPriced[m.id]!;
        }
        const SUBSTITUTION = 0.15;
        const redist = Math.max(0, baseSum - pricedSum) * SUBSTITUTION;
        const mixNoise: Record<string, number> = {};
        for (const m of MENU) mixNoise[m.id] = popPriced[m.id]! + (redist * popBase[m.id]!) / baseSum;
        const itemsPerCover = dp.id === "lunch" ? 1.84 : 2.47;
        const units: Record<string, number> = {};
        let gross = 0;
        for (const m of MENU) {
          const u = Math.max(0, Math.round(covers * itemsPerCover * (mixNoise[m.id]! / baseSum)));
          units[m.id] = u;
          gross += u * priceOf[m.id]!;
          if (u && m.usesSku) addTheo(L.id, week, m.usesSku.sku, u * m.usesSku.qtyPerUnit);
        }
        weekCovers.set(`${L.id}|${week}`, (weekCovers.get(`${L.id}|${week}`) ?? 0) + covers);

        // ---- comps ----
        let compRate = 0.021 + compsShock + rng.norm(0, 0.004);
        for (const cs of [SIGNALS.compsSpike, SIGNALS.compsLive, SIGNALS.compsRecode]) if (cs.loc === L.id && dp.id === cs.daypart && date >= cs.from && date < cs.to) compRate += cs.add;
        for (const ch of applied) if (ch.kind === "comps_rate" && ch.loc === L.id && (!ch.daypart || ch.daypart === dp.id) && date >= ch.from) compRate += ch.value;
        compRate = Math.max(0.004, compRate);
        const compsTarget = Math.round(gross * compRate);

        // ---- labour: the room's own service rate, never a cover cap ----
        const mu = dp.id === "lunch" ? 13.0 : 10.0;
        const lambda = covers / dp.hours;
        const needServers = Math.max(2, lambda / mu + 0.6 * Math.sqrt(Math.max(lambda / mu, 0.01)));
        let servers = needServers * (1 + rng.norm(0, 0.06));
        if (FIXES.alaLabour.loc === L.id && dp.id === FIXES.alaLabour.daypart && date >= FIXES.alaLabour.from) servers += FIXES.alaLabour.serverHours / dp.hours;
        if (FIXES.brkLabour.loc === L.id && dp.id === FIXES.brkLabour.daypart && date >= FIXES.brkLabour.from) servers += FIXES.brkLabour.serverHours / dp.hours;
        servers = Math.max(2, servers);
        const plan: Record<string, number> = {
          server: servers * dp.hours,
          busser: Math.max(0.6, servers * 0.3) * dp.hours,
          host: Math.max(0.7, covers / 120) * dp.hours,
          bar: Math.max(dp.id === "lunch" ? 0.3 : 0.7, covers / (dp.id === "lunch" ? 180 : 95)) * dp.hours,
          line: Math.max(1.8, covers / (dp.id === "lunch" ? 46 : 38)) * dp.hours,
          prep: Math.max(0.6, covers / 140) * dp.hours,
          dish: Math.max(0.6, covers / 140) * dp.hours,
        };
        const ts = SIGNALS.tuesdayOverstaff;
        const overstaffed = ts.loc === L.id && dow === ts.dow && dp.id === ts.daypart && date >= ts.from;
        const tueFixApplied = overstaffed && date >= FIXES.oakTue.from;
        if (overstaffed) for (const k of Object.keys(ts.excess)) plan[k] = (plan[k] ?? 0) + ts.excess[k]! * (tueFixApplied ? 1 - FIXES.oakTue.removeShare : 1);
        for (const ch of applied) {
          if (ch.kind !== "labour_hours" || ch.loc !== L.id || (ch.daypart && ch.daypart !== dp.id) || (ch.dows && !ch.dows.includes(dow)) || date < ch.from) continue;
          const roles = ch.roles ?? { server: 1 };
          const total = Object.values(roles).reduce((a, b) => a + b, 0) || 1;
          for (const [role, share] of Object.entries(roles)) plan[role] = Math.max(0.5, (plan[role] ?? 0) - (ch.value * share) / total);
        }

        // ---- ticket time and rating ----
        let ticket = (dp.id === "lunch" ? 12.8 : 16.4) * (1 + 0.42 * Math.max(0, coversF / cap - 0.62)) + rng.norm(0, 1.1);
        const tc = SIGNALS.ticketCreep;
        if (tc.loc === L.id && dp.id === tc.daypart && date >= tc.from) ticket += tc.addMin * Math.min(1, daysBetween(tc.from, date) / 28);
        if (FIXES.brkTicket.loc === L.id && dp.id === FIXES.brkTicket.daypart && date >= FIXES.brkTicket.from) ticket += FIXES.brkTicket.ticketAddMin;
        if (FIXES.alaLabour.loc === L.id && dp.id === FIXES.alaLabour.daypart && date >= FIXES.alaLabour.from) ticket += FIXES.alaLabour.ticketAddMin;
        for (const ch of applied) if (ch.kind === "ticket" && ch.loc === L.id && (!ch.daypart || ch.daypart === dp.id) && date >= ch.from) ticket += ch.value;
        ticket = Math.max(6, ticket);
        let rating = 4.46 - 0.024 * Math.max(0, ticket - 15) + rng.norm(0, 0.09);
        if (FIXES.alaLabour.loc === L.id && dp.id === FIXES.alaLabour.daypart && date >= FIXES.alaLabour.from) rating -= FIXES.alaLabour.ratingDrop;
        rating = Math.min(5, Math.max(3.1, rating));
        const constrainedShare = dp.id === "dinner" && (dow === 5 || dow === 6) ? SIGNALS.constrained[L.id]! : SIGNALS.constrained[L.id]! * 0.18;

        // ---- canonicalise: checks and order lines ----
        const avgParty = dp.id === "lunch" ? 2.1 : 2.6;
        const nChecks = Math.max(1, Math.round(covers / avgParty));
        const partyW = Array.from({ length: nChecks }, () => 0.6 + rng.u());
        const parties = splitInt(covers - nChecks, partyW).map((x) => x + 1);
        const checkIds = parties.map((_, k) => `chk:${L.id}:${date}:${dp.id}:${k}`);
        const lineGross = new Array<number>(nChecks).fill(0);
        let itemIdx = 0;
        for (const m of MENU) {
          const u = units[m.id]!;
          if (!u) {
            itemIdx++;
            continue;
          }
          const nLines = Math.min(nChecks, Math.max(1, Math.ceil(u / 2.5)));
          const qtys = splitInt(u, Array.from({ length: nLines }, () => 1));
          const offset = (itemIdx * 7 + Math.floor(rng.u() * nChecks)) % nChecks;
          const isFood = m.category !== "Beverage";
          for (let l = 0; l < nLines; l++) {
            const q = qtys[l]!;
            if (!q) continue;
            const ck = (offset + l) % nChecks;
            const cost = recipeCostOn(m, date);
            orderItems.push({
              id: `oi:${L.id}:${date}:${dp.id}:${m.id}:${l}`,
              checkId: checkIds[ck]!,
              loc: L.id,
              businessDate: date,
              daypart: dp.id,
              menuItemId: m.id,
              qty: q,
              unitPriceCents: priceOf[m.id]!,
              unitCostCents: cost,
              ticketMin: isFood ? Math.round((ticket + rng.norm(0, 1.6)) * 10) / 10 : null,
            });
            lineGross[ck]! += q * priceOf[m.id]!;
          }
          itemIdx++;
        }
        // comps: whole-check write-offs on a few checks until the service's comp total is reached
        const compPer = new Array<number>(nChecks).fill(0);
        let compLeft = compsTarget;
        let guard = 0;
        while (compLeft > 0 && guard++ < nChecks * 3) {
          const ck = Math.floor(rng.u() * nChecks);
          const g = lineGross[ck]!;
          if (g <= 0) continue;
          const amt = Math.min(compLeft, Math.round(g * (0.25 + rng.u() * 0.5)));
          compPer[ck]! += amt;
          compLeft -= amt;
        }
        const hoursOpen = dp.startHour;
        for (let k = 0; k < nChecks; k++) {
          const g = lineGross[k]!;
          const comp = Math.min(compPer[k]!, g);
          const subtotal = g - comp;
          const tax = Math.round(subtotal * 0.0925);
          const tip = Math.round(subtotal * (0.16 + rng.u() * 0.06));
          const openMin = Math.floor((k / nChecks) * dp.hours * 60);
          const hh = hoursOpen + Math.floor(openMin / 60);
          const mm = openMin % 60;
          const dur = dp.id === "lunch" ? 45 + Math.floor(rng.u() * 20) : 70 + Math.floor(rng.u() * 40);
          const closeTot = hh * 60 + mm + dur;
          checks.push({
            id: checkIds[k]!,
            loc: L.id,
            businessDate: date,
            daypart: dp.id,
            guestCount: parties[k]!,
            subtotalCents: subtotal,
            compCents: comp,
            voidCents: 0,
            discountCents: 0,
            taxCents: tax,
            tipCents: tip,
            totalCents: subtotal + tax + tip,
            voided: false,
            serverRef: `${L.id}-server-${(k % Math.max(1, Math.round(servers))) + 1}`,
            tableRef: `T${(k % Math.max(6, Math.round(L.seats / 4))) + 1}`,
            openedAt: `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`,
            closedAt: `${date}T${String(Math.floor(closeTot / 60)).padStart(2, "0")}:${String(closeTot % 60).padStart(2, "0")}:00`,
          });
        }

        // ---- shifts: one row per employee-shift ----
        for (const r of ROLES) {
          const H = roundQuarter(plan[r.id] ?? 0);
          if (H <= 0) continue;
          const shiftLen = dp.hours + 1;
          const nEmp = Math.max(1, Math.ceil(H / shiftLen));
          const per = splitInt(Math.round(H * 4), Array.from({ length: nEmp }, () => 1)).map((q) => q / 4);
          for (let e = 0; e < nEmp; e++) {
            const sched = per[e]!;
            if (sched <= 0) continue;
            const clocked = roundQuarter(sched * (1 + Math.max(-0.04, rng.norm(0.012, 0.03))));
            shifts.push({ id: `sh:${L.id}:${date}:${dp.id}:${r.id}:${e}`, loc: L.id, businessDate: date, daypart: dp.id, role: r.id, employeeRef: `${L.id}-${r.id}-${e + 1}`, scheduledHours: sched, clockedHours: clocked, wageRateCents: r.loadedRateCents });
          }
        }

        // ---- reviews (a daily aggregate from the reviews feed) and reservations ----
        reviews.push({ id: `rv:${L.id}:${date}:${dp.id}`, loc: L.id, businessDate: date, daypart: dp.id, rating: Math.round(rating * 100) / 100, isComplaint: rating < 4.1 });
        reservations.push({
          id: `rs:${L.id}:${date}:${dp.id}`,
          loc: L.id,
          businessDate: date,
          daypart: dp.id,
          booked: dp.id === "dinner" ? Math.round(covers * 0.52) : 0,
          walkIn: dp.id === "dinner" ? covers - Math.round(covers * 0.52) : covers,
          quotedWaitMin: Math.round(constrainedShare * 46),
          abandoned: Math.round(turnedAway * 0.31),
          turnedAway: Math.round(turnedAway),
          constrainedShare,
          capacity: Math.round(cap),
          holiday,
        });
      }
    }
  }

  // ---- invoices: weekly, per location, per SKU ----
  const lastFullWeek = weekOf(through);
  for (let w = weekOf(START); w < lastFullWeek; w = addDays(w, 7)) {
    for (const L of LOCATIONS) {
      const rng = rngFor(seed, "inv", L.id, w);
      const wkCovers = weekCovers.get(`${L.id}|${w}`) ?? 0;
      const wkIndex = daysBetween(START, w) / 7;
      for (const sk of SKUS) {
        let unitPrice = sk.baseCents * (1 + rng.norm(0, 0.012));
        if (sk.id === SIGNALS.chickenPriceStep.sku && w >= SIGNALS.chickenPriceStep.from) unitPrice *= SIGNALS.chickenPriceStep.mult;
        if (sk.id === FIXES.chuck.sku && w >= FIXES.chuck.from) unitPrice *= FIXES.chuck.mult;
        for (const ch of applied) if (ch.kind === "sku_price" && ch.sku === sk.id && w >= ch.from) unitPrice *= ch.value;
        if (sk.id === "sk03") unitPrice *= 1 + 0.09 * Math.sin(wkIndex / 7);
        if (sk.id === "sk06") unitPrice *= 1 + 0.06 * Math.sin(wkIndex / 9 + 1.2);
        let qty: number;
        if (sk.fromRecipe) {
          const theo = theoretical.get(`${L.id}|${w}|${sk.id}`) ?? 0;
          qty = theo * 1.042 * (1 + rng.norm(0, 0.028));
          if (sk.id === "sk01" && SIGNALS.portionDrift.loc === L.id && w >= SIGNALS.portionDrift.from) {
            const ramp = Math.min(1, daysBetween(SIGNALS.portionDrift.from, w) / 21);
            qty *= 1 + SIGNALS.portionDrift.overPour * ramp;
          }
          if (sk.id === "sk06" && SIGNALS.potatoOverPortion.loc === L.id) {
            let ratio = SIGNALS.potatoOverPortion.ratio;
            if (w >= FIXES.fries.from) {
              const t = daysBetween(FIXES.fries.from, w);
              ratio *= 1 + FIXES.fries.size * Math.pow(0.5, t / FIXES.fries.halfLifeDays);
            }
            qty *= ratio;
          }
          for (const ch of applied) if (ch.kind === "portion" && ch.sku === sk.id && ch.loc === L.id && w >= ch.from) qty *= ch.value;
        } else {
          qty = wkCovers * (sk.perCover ?? 0) * (1 + rng.norm(0, 0.05));
        }
        qty = Math.round(qty * 10) / 10;
        invoices.push({ loc: L.id, week: w, sku: sk.id, vendor: sk.vendor, unitPriceCents: Math.round(unitPrice), qty, extendedCents: Math.round(Math.round(unitPrice) * qty) });
      }
    }
  }

  const locations = LOCATIONS.map(({ id, name, short, seats, opened, gm, chef, concept }) => ({ id, name, short, seats, opened, gm, chef, concept }));
  const roles = ROLES.map(({ id, label, foh, loadedRateCents }) => ({ id, label, foh, loadedRateCents }));
  const skus = SKUS.map(({ id, name, vendor, unit }) => ({ id, name, vendor, unit }));
  const canonical: RosewoodCanonical = { locations, dayparts: DAYPARTS, menu, skus, roles, checks, orderItems, shifts, reviews, reservations, invoices, recipeCosts: buildRecipeCosts(through), feeds: [], through };
  canonical.feeds = buildFeeds(canonical, addDays(through, 1));
  return canonical;
}

/** Feed catalogue with newest business date DERIVED from delivered rows (I1). */
export function buildFeeds(c: RosewoodCanonical, asOf: IsoDate): Feed[] {
  const maxDate = (arr: Array<{ businessDate: string }>) => arr.reduce((a, r) => (r.businessDate > a ? r.businessDate : a), "0000-00-00");
  const posDate = maxDate(c.checks);
  const rowsFor: Record<string, number> = {
    toast_orders: c.orderItems.length,
    toast_labour: c.shifts.length,
    recipes: c.recipeCosts.length * c.locations.length,
    invoices: c.invoices.length,
    auth: 14,
    scheduling: c.shifts.length,
    kds: c.orderItems.filter((o) => o.ticketMin != null).length,
    reservations: c.reservations.length,
    reviews: c.reviews.length,
    accounting: 9120,
  };
  return FEED_SPECS.map((f) => {
    const rule = FEED_STALENESS[f.id] ?? "pos";
    let newest: string;
    if (rule === "pos") newest = posDate;
    else if (rule === "today") newest = asOf;
    else if (rule === "yesterday") newest = addDays(asOf, -1);
    else if (rule === "two_days") newest = addDays(asOf, -2);
    else newest = rule;
    // A fixed stale date can never be in the future of the clock.
    if (newest > asOf) newest = asOf;
    return { id: f.id, name: f.name, tier: f.tier, access: f.access, cadence: f.cadence, slaHours: f.slaHours, fields: f.fields, stages: f.stages, newest, rows: rowsFor[f.id] ?? 0, degraded: f.degraded, completeness: f.completeness };
  });
}
