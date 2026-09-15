/**
 * Detectors — seven of them, every one reading the register through a control
 * chart, never a constant. Signals are planted in the data by the fixture; the
 * detectors have to find them the way they would in a real register.
 */
import { cusumChart, driftOnset, ewmaChart, type DriftOnset, type SeriesPoint } from "./charts.js";
import { addDays, DOW_SHORT, formatDate, type IsoDate, MONTH_SHORT, weekOf } from "./dates.js";
import { measureRate, requiredHours } from "./labour.js";
import { formatPct, formatUsd, type Cents } from "./money.js";
import type { FeedHealth, Register } from "./register.js";
import { groupBy, menuById, skuById } from "./register.js";
import { leverMeta, type AutonomyLevel, type Lever, type MeasurementFamily } from "./registry.js";
import { mean, sum, tq } from "./stats.js";

export interface Cause {
  cause: string;
  p: number;
  sep: string;
}
export interface Remedy {
  change: string;
  alternatives: string[];
  effort: number;
  risk: "low" | "medium" | "high" | "blocked";
  latencyDays: number;
  artifact: string;
}
export interface Observed {
  metric: string;
  actual: number;
  baseline: number;
  unit: string;
  periodLabel: string;
}

export interface FindingCore {
  id: string;
  detector: string;
  detectorCode: string;
  domain: string;
  lever: Lever;
  family: MeasurementFamily;
  loc: string;
  locs: string[];
  daypart: string | null;
  dow: number | null;
  scopeKey: string;
  account: string;
  equations: string[];
  feeds: string[];
  title: string;
  plain: string;
  onset: DriftOnset | null;
  observed: Observed;
  exposureCents: Cents;
  projectedLowCents?: Cents;
  projectedHighCents?: Cents;
  series: SeriesPoint[];
  chartBaselineN: number | null;
  evidenceCount: number;
  /** Days between observations at the grain the detector judged (1 = per service, 7 = per week). */
  cadenceDays: number;
  causes: Cause[];
  remedy: Remedy;
  guardrails: string[];
  contraindications: string[];
  autonomy: AutonomyLevel;
  claimCeiling?: "modelled";
  items?: string[];
  sku?: string;
  blockedBy?: { feed: string; ageDays: number | null; why: string } | null;
  extra?: Record<string, unknown>;
}

export interface DetectorOptions {
  /** Minimum weekly exposure, in cents, below which a finding is not worth an operator's Tuesday. */
  minWeeklyCents?: number;
}

function slug(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function detectors(reg: Register, feeds: readonly FeedHealth[], asOf: IsoDate, opts: DetectorOptions = {}): FindingCore[] {
  const F: FindingCore[] = [];
  const weeksBack = (n: number) => addDays(asOf, -7 * n);
  const feedFor = (id: string): FeedHealth | undefined => feeds.find((f) => f.id === id);
  const MENU = menuById(reg);
  const SKU = skuById(reg);
  const dayparts = reg.dayparts;

  const HAS_RECIPE_LINK = reg.menu.some((m) => m.usesSku);
  const HAS_COST = reg.menu.some((m) => m.costCents != null && m.costCents > 0);
  const HAS_TICKET = reg.services.some((s) => s.ticketMin != null);

  /* ---- D1 · Excess paid hours (C1 → C2 → C6, costed by C4) ---------------- */
  const shiftIdx = groupBy(reg.shifts, (r) => `${r.loc}|${r.date}|${r.daypart}`);
  for (const L of reg.locations) {
    for (const dp of dayparts) {
      for (let dow = 0; dow < 7; dow++) {
        const sv = reg.services.filter((s) => s.loc === L.id && s.daypart === dp.id && s.dow === dow && s.date >= weeksBack(26));
        if (sv.length < 12) continue;
        const hoursFor = (s: { loc: string; date: string; daypart: string }, roles?: string[]) => (shiftIdx.get(`${s.loc}|${s.date}|${s.daypart}`) ?? []).filter((r) => !roles || roles.includes(r.role)).reduce((a, r) => a + r.clockedHours, 0);
        const costFor = (s: { loc: string; date: string; daypart: string }) => (shiftIdx.get(`${s.loc}|${s.date}|${s.daypart}`) ?? []).reduce((a, r) => a + r.clockedHours * r.rateCents, 0);
        // C1 — the unit being judged never sits inside its own benchmark.
        const peer = reg.services.filter((s) => s.loc === L.id && s.daypart === dp.id && s.dow !== dow && s.date >= weeksBack(26));
        if (peer.length < 40) continue;
        const rate = measureRate(peer, (s) => hoursFor(s, ["server"]), (s) => hoursFor(s));
        if (!rate.mu) continue; // C1 declined to estimate — no finding may rest on it
        const excess = sv.map((s) => {
          const req = requiredHours(s.covers, dp.hours, rate.mu as number, rate.rosterRatio);
          const actual = hoursFor(s);
          return { date: s.date, v: actual - req, hours: actual, req, covers: s.covers, cost: costFor(s) };
        });
        const recent = excess.filter((e) => e.date >= weeksBack(12));
        const prior = excess.filter((e) => e.date < weeksBack(12));
        if (recent.length < 6 || prior.length < 6) continue;
        const baselineN = Math.min(14, excess.length - 6);
        const cus = cusumChart(excess, { baselineN });
        const onset = driftOnset(cus, { direction: "high" });
        const delta = mean(recent.map((e) => e.v)) - mean(prior.map((e) => e.v));
        if (delta < 4.5) continue; // below the MDE at this grain
        if (!onset || onset.direction !== "high") continue;
        const blendedRate = mean(recent.map((e) => e.cost / Math.max(e.hours, 1)));
        const weekly = Math.round(delta * blendedRate);
        if (weekly < (opts.minWeeklyCents ?? 9000)) continue;
        const dpLabel = dp.label.toLowerCase();
        F.push({
          id: `F-LAB-${slug(L.id)}-${slug(dp.id)}-${DOW_SHORT[dow] as string}`.toUpperCase(),
          detector: "D1 · Excess paid hours",
          detectorCode: "LAB",
          domain: "Labour",
          lever: "labour_hours",
          family: "C",
          loc: L.id,
          locs: [L.id],
          daypart: dp.id,
          dow,
          scopeKey: `${L.id}|${dp.id}|dow${dow}`,
          account: "6020 · Hourly labour",
          equations: ["C1", "C2", "C4", "C6", "E2", "E3"],
          feeds: ["toast_orders", "toast_labour", "scheduling"],
          title: `${DOW_SHORT[dow]} ${dpLabel} is carrying hours the room does not need`,
          plain: `${DOW_SHORT[dow]} ${dpLabel} at ${L.short} is carrying about ${delta.toFixed(0)} paid hours the room did not need.`,
          onset,
          observed: { metric: "Paid labour hours per service", actual: mean(recent.map((e) => e.hours)), baseline: mean(recent.map((e) => e.req)), unit: "hours", periodLabel: "last 12 comparable services" },
          exposureCents: weekly,
          series: excess.map((e) => ({ date: e.date, v: e.v })),
          chartBaselineN: baselineN,
          evidenceCount: recent.length,
          cadenceDays: 7,
          causes: [
            { cause: `The schedule template was not re-cut after ${DOW_SHORT[dow]} volume fell`, p: 0.62, sep: "Compare the published template against the covers curve for the last eight weeks" },
            { cause: "Servers held over from the prior service rather than cut on the floor", p: 0.24, sep: "Clock-out times against the pacing curve" },
            { cause: "A training or onboarding shift not flagged as non-productive", p: 0.14, sep: "Role codes on the time entries" },
          ],
          remedy: {
            change: `Cut ${Math.round(delta * 0.75)} scheduled hours from ${DOW_SHORT[dow]} ${dpLabel} — one server off at ${dp.id === "dinner" ? "8:00pm" : "1:30pm"}, one busser off at ${dp.id === "dinner" ? "8:30pm" : "2:00pm"}`,
            alternatives: ["Cut the whole block at once (higher risk to service)", "Move the hours to Friday where the room is constrained"],
            effort: 0.5,
            risk: "medium",
            latencyDays: 0,
            artifact: "A revised week in 7shifts with the cut already made, ready to publish",
          },
          guardrails: ["net_sales", "covers", "ticket_time", "rating", "overtime"],
          contraindications: ["Do not cut below three servers on the floor at any point"],
          autonomy: "A1",
          extra: { muMeasured: rate.mu, rosterRatio: rate.rosterRatio, deltaHours: delta, blendedRateCents: Math.round(blendedRate), cutHours: Math.round(delta * 0.75) },
        });
      }
    }
  }

  /* ---- D2 · Purchase price variance (E5) ---------------------------------- */
  for (const sk of reg.skus) {
    const rows = reg.invoices.filter((i) => i.sku === sk.id && i.week >= weeksBack(26));
    if (rows.length < 20) continue;
    const byWeek = [...groupBy(rows, (r) => r.week).entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([w, rs]) => ({ date: w, v: sum(rs.map((r) => r.extendedCents)) / Math.max(sum(rs.map((r) => r.qty)), 1e-9), qty: sum(rs.map((r) => r.qty)) }));
    const cus = cusumChart(byWeek, { baselineN: 10 });
    const onset = driftOnset(cus, { direction: "high" });
    if (!onset || onset.direction !== "high") continue;
    const pre = byWeek.filter((p) => p.date < onset.onsetDate);
    const post = byWeek.filter((p) => p.date >= onset.signalDate);
    if (pre.length < 4 || post.length < 3) continue;
    const p0 = mean(pre.map((p) => p.v));
    const p1 = mean(post.map((p) => p.v));
    const q0 = mean(pre.map((p) => p.qty));
    const q1 = mean(post.map((p) => p.qty));
    const priceLeg = (p1 - p0) * q1; // counting rule 10: legs decompose exactly
    const mixLeg = (q1 - q0) * p0;
    if (priceLeg < 8000) continue;
    const locs = [...new Set(rows.map((r) => r.loc))];
    F.push({
      id: `F-PPV-${slug(sk.id)}`,
      detector: "D2 · Purchase price variance",
      detectorCode: "PPV",
      domain: "Purchasing",
      lever: "purchasing",
      family: "A",
      loc: "group",
      locs,
      daypart: null,
      dow: null,
      scopeKey: `group|sku:${sk.id}`,
      account: "5010 · Food cost",
      equations: ["E5", "E3", "G10"],
      feeds: ["invoices"],
      sku: sk.id,
      title: `${sk.name} is costing more per ${sk.unit} than it did in ${MONTH_SHORT[Number(onset.onsetDate.slice(5, 7)) - 1]}`,
      plain: `${sk.vendor} raised ${sk.name.toLowerCase()} from ${formatUsd(p0, { dp: 2 })} to ${formatUsd(p1, { dp: 2 })} per ${sk.unit} on ${formatDate(onset.onsetDate)}. Nobody renegotiated.`,
      onset,
      observed: { metric: `Unit price, ${sk.unit}`, actual: p1, baseline: p0, unit: "cents_per_unit", periodLabel: `${post.length} invoice weeks` },
      exposureCents: Math.round(priceLeg),
      series: byWeek.map((p) => ({ date: p.date, v: p.v })),
      chartBaselineN: 10,
      evidenceCount: post.length,
      cadenceDays: 7,
      causes: [
        { cause: "Vendor list price increase applied without notice", p: 0.71, sep: "Compare the same SKU at the other two vendors on the approved list" },
        { cause: "Fell off a contracted tier by ordering below the volume break", p: 0.19, sep: "Weekly volume against the tier threshold in the contract" },
        { cause: "Spec change — a different grade is being delivered under the same SKU", p: 0.1, sep: "Invoice line descriptions and the last three delivery tickets" },
      ],
      remedy: {
        change: `Re-quote ${sk.name.toLowerCase()} with ${sk.vendor} and two alternates; hold at ${formatUsd(p0 * 1.03, { dp: 2 })} or move the SKU`,
        alternatives: ["Consolidate the three rooms into one order to reach the next volume break", "Substitute a comparable grade"],
        effort: 1.5,
        risk: "low",
        latencyDays: 14,
        artifact: "A quote request with the last 26 weeks of volume by room attached",
      },
      guardrails: ["comps", "rating"],
      contraindications: [],
      autonomy: "A1",
      extra: { priceLegCents: Math.round(priceLeg), mixLegCents: Math.round(mixLeg), p0, p1, q0, q1 },
    });
  }

  /* ---- D3 · Theoretical vs actual usage (E6 / G10) ------------------------ */
  if (HAS_RECIPE_LINK) {
    const linked = reg.menu.filter((m) => m.usesSku);
    const skuIds = [...new Set(linked.map((m) => (m.usesSku as { sku: string }).sku))];
    for (const skuId of skuIds) {
      const items = linked.filter((m) => (m.usesSku as { sku: string }).sku === skuId);
      const sk = SKU.get(skuId);
      if (!sk) continue;
      for (const L of reg.locations) {
        const inv = reg.invoices.filter((i) => i.loc === L.id && i.sku === skuId && i.week >= weeksBack(26));
        if (inv.length < 16) continue;
        const series = [...groupBy(inv, (r) => r.week).entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([w, rs]) => {
            const bought = sum(rs.map((r) => r.qty));
            const wkEnd = addDays(w, 7);
            const sold = reg.itemDays.filter((r) => r.loc === L.id && r.date >= w && r.date < wkEnd).reduce((a, r) => {
              const m = MENU.get(r.item);
              return a + (m?.usesSku && m.usesSku.sku === skuId ? r.units * m.usesSku.qtyPerUnit : 0);
            }, 0);
            return { date: w, bought, theoretical: sold, v: sold > 0 ? bought / sold : 1, price: mean(rs.map((r) => r.unitPriceCents)) };
          });
        const cus = cusumChart(series, { baselineN: 10 });
        const onset = driftOnset(cus, { direction: "high" });
        if (!onset || onset.direction !== "high") continue;
        const post = series.filter((p) => p.date >= onset.signalDate);
        const pre = series.filter((p) => p.date < onset.onsetDate);
        if (post.length < 3 || pre.length < 4) continue;
        const r0 = mean(pre.map((p) => p.v));
        const r1 = mean(post.map((p) => p.v));
        const excessQty = mean(post.map((p) => p.theoretical)) * (r1 - r0);
        const weekly = Math.round(excessQty * mean(post.map((p) => p.price)));
        if (weekly < 6000) continue;
        F.push({
          id: `F-POR-${slug(L.id)}-${slug(skuId)}`,
          detector: "D3 · Theoretical vs actual usage",
          detectorCode: "POR",
          domain: "Kitchen",
          lever: "portion",
          family: "C",
          loc: L.id,
          locs: [L.id],
          daypart: null,
          dow: null,
          scopeKey: `${L.id}|sku:${skuId}`,
          account: "5010 · Food cost",
          equations: ["E6", "G10", "E3", "B2"],
          feeds: ["invoices", "recipes", "toast_orders"],
          sku: skuId,
          items: items.map((m) => m.id),
          title: `More ${sk.name.split(",")[0]?.toLowerCase()} is leaving the walk-in than the tickets explain`,
          plain: `${L.short} is buying ${((r1 - r0) * 100).toFixed(0)}% more ${sk.name.toLowerCase()} than the plates sold account for. That started around ${formatDate(onset.onsetDate)}.`,
          onset,
          observed: { metric: "Purchased ÷ theoretical usage", actual: r1, baseline: r0, unit: "ratio", periodLabel: `${post.length} reorder cycles` },
          exposureCents: weekly,
          series: series.map((p) => ({ date: p.date, v: p.v })),
          chartBaselineN: 10,
          evidenceCount: post.length,
          cadenceDays: 7,
          causes: [
            { cause: "Portioning drifted — the spec is 6oz and the line is plating closer to 7½", p: 0.58, sep: "Weigh twenty plates across two services against the spec card" },
            { cause: "Trim yield fell — a different cut is arriving under the same SKU", p: 0.27, sep: "Yield test on one case against the recorded yield in the recipe file" },
            { cause: "Waste or theft not recorded in the waste log", p: 0.15, sep: "Waste log entries against the gap for the same weeks" },
          ],
          remedy: {
            change: `Scale on the line for the ${sk.name.split(",")[0]?.toLowerCase()} station, spec card posted, and a yield test on the next case`,
            alternatives: ["Pre-portion at prep instead of on the line", "Switch to a pre-portioned SKU at a higher unit price"],
            effort: 2.0,
            risk: "low",
            latencyDays: 3,
            artifact: "A prep-sheet revision with the 6oz spec and a yield-test form for the next delivery",
          },
          guardrails: ["rating", "covers"],
          contraindications: [],
          autonomy: "A1",
          extra: { ratioNow: r1, ratioBase: r0, excessQtyPerWeek: excessQty, unit: sk.unit },
        });
      }
    }
  }

  /* ---- D4 · Comps & voids above the location's own control limits --------- */
  for (const L of reg.locations) {
    for (const dp of dayparts) {
      const sv = reg.services.filter((s) => s.loc === L.id && s.daypart === dp.id && s.date >= weeksBack(26));
      if (sv.length < 40) continue;
      // The room against its own history. A week the whole group comped heavily is not this
      // room's finding: if the other rooms' pooled chart is breaching over the same services,
      // the detector stands down and the group-level cause is someone else's finding.
      const series = sv.map((s) => ({ date: s.date, v: s.compsCents / Math.max(s.grossCents, 1) }));
      const chart = ewmaChart(series, { baselineN: 28 });
      const recent = chart.points.slice(-28);
      if (recent.filter((p) => p.signal === "high").length < 8) continue;
      const peerByDate = new Map<string, { comps: number; gross: number }>();
      for (const s of reg.services) {
        if (s.loc === L.id || s.daypart !== dp.id || s.date < weeksBack(26)) continue;
        const cur = peerByDate.get(s.date) ?? { comps: 0, gross: 0 };
        peerByDate.set(s.date, { comps: cur.comps + s.compsCents, gross: cur.gross + s.grossCents });
      }
      const peers = [...peerByDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, p]) => ({ date, v: p.gross > 0 ? p.comps / p.gross : 0 }));
      if (peers.length >= 40) {
        const peerChart = ewmaChart(peers, { baselineN: 28 });
        if (peerChart.points.slice(-28).filter((p) => p.signal === "high").length >= 8) continue;
      }
      const excessRate = mean(recent.map((p) => p.z)) - chart.mu;
      const weekly = Math.round(excessRate * sum(sv.filter((s) => s.date >= weeksBack(1)).map((s) => s.grossCents)));
      if (weekly < 5000) continue;
      const cus = cusumChart(series, { baselineN: 28 });
      const onset = driftOnset(cus, { direction: "high" });
      F.push({
        id: `F-CMP-${slug(L.id)}-${slug(dp.id)}`,
        detector: "D4 · Comps and voids above control limits",
        detectorCode: "CMP",
        domain: "Service",
        lever: "comps",
        family: "A",
        loc: L.id,
        locs: [L.id],
        daypart: dp.id,
        dow: null,
        scopeKey: `${L.id}|${dp.id}|comps`,
        account: "4900 · Comps and discounts",
        equations: ["A5", "E2", "E3"],
        feeds: ["toast_orders"],
        title: `${dp.label} comps are running above this room's own control limits`,
        plain: `${L.short} ${dp.label.toLowerCase()} is comping ${formatPct(mean(recent.map((p) => p.v)), 1)} of gross against its own baseline of ${formatPct(chart.mu, 1)}. The other rooms did not move over the same services.`,
        onset,
        observed: { metric: "Comps ÷ gross", actual: mean(recent.map((p) => p.v)), baseline: chart.mu, unit: "ratio", periodLabel: "last 28 services" },
        exposureCents: weekly,
        series,
        chartBaselineN: 28,
        evidenceCount: recent.length,
        cadenceDays: 1,
        causes: [
          { cause: "One manager comping to resolve ticket-time complaints", p: 0.54, sep: "Comps by approving employee against ticket time on the same checks" },
          { cause: "A recurring quality problem on one or two items", p: 0.31, sep: "Comped items by menu item over the same period" },
          { cause: "Comp policy not enforced at shift change", p: 0.15, sep: "Comps by hour of service" },
        ],
        remedy: {
          change: "Comp approval above $25 moves to the manager on duty, and a weekly comps-by-reason review in the pre-shift",
          alternatives: ["Fix the ticket-time cause first and re-measure", "Blanket comp cap per check"],
          effort: 0.75,
          risk: "low",
          latencyDays: 7,
          artifact: "A Toast approval-threshold change and a one-page comps-by-reason sheet",
        },
        guardrails: ["rating", "covers", "net_sales"],
        contraindications: [],
        autonomy: "A1",
        extra: { excessRate, baselineRate: chart.mu },
      });
    }
  }

  /* ---- D5 · Menu price below the contribution-maximising point (B6/B7) ---- */
  if (HAS_COST) {
    for (const L of reg.locations) {
      const coverByWeek = new Map([...groupBy(reg.services.filter((s) => s.loc === L.id), (s) => weekOf(s.date)).entries()].map(([w, ss]) => [w, sum(ss.map((s) => s.covers))]));
      for (const m of reg.menu) {
        if (m.costCents == null || !(m.costCents > 0)) continue; // no plate cost, no contribution, no claim
        const rows = reg.itemDays.filter((r) => r.loc === L.id && r.item === m.id && r.date >= weeksBack(52));
        if (rows.length < 120) continue;
        const prices = [...new Set(rows.map((r) => r.priceCents))];
        if (prices.length < 3) continue; // B6 refuses
        const wk = [...groupBy(rows, (r) => weekOf(r.date)).entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([w, rs]) => ({ date: w, units: sum(rs.map((r) => r.units)), price: mean(rs.map((r) => r.priceCents)), cost: mean(rs.map((r) => r.costCents)) }))
          .filter((p) => p.units > 0);
        if (wk.length < 24) continue;
        // Normalise units by the room's own covers that week before estimating.
        const lnU = wk.map((p) => Math.log(p.units / Math.max(1, coverByWeek.get(p.date) ?? 1)));
        const lnP = wk.map((p) => Math.log(p.price));
        const mp = mean(lnP);
        const mu_ = mean(lnU);
        let num = 0;
        let den = 0;
        for (let i = 0; i < wk.length; i++) {
          num += ((lnP[i] as number) - mp) * ((lnU[i] as number) - mu_);
          den += ((lnP[i] as number) - mp) ** 2;
        }
        const eps = den > 1e-9 ? num / den : 0;
        const resid = lnU.map((y, i) => y - (mu_ + eps * ((lnP[i] as number) - mp)));
        const seEps = den > 1e-9 ? Math.sqrt(sum(resid.map((r) => r * r)) / (wk.length - 2) / den) : 99;
        if (!(seEps < Math.abs(eps) / 2)) continue; // refuse an imprecise elasticity
        const last = wk[wk.length - 1] as { price: number; cost: number };
        const cost = last.cost;
        const price = last.price;
        if (eps >= -1.0) continue; // too inelastic to price from data — B7 refuses
        const pStar = (cost * eps) / (1 + eps);
        const dpi = price * (1 + eps) - cost * eps;
        if (dpi <= 0) continue;
        const maxObserved = Math.max(...prices);
        const extrapolating = pStar > maxObserved * 1.25;
        // A BOUNDED step — never more than 8% in one move, never past p*.
        const rawTarget = Math.min(pStar, price * 1.08, maxObserved * 1.25);
        const target = Math.round(rawTarget / 25) * 25;
        if (target <= price) continue;
        const unitsNow = mean(wk.slice(-8).map((p) => p.units));
        const cmAt = (p: number, e: number) => (p - cost) * unitsNow * Math.pow(p / price, e);
        const weekly = Math.round(cmAt(target, eps) - cmAt(price, eps));
        const tc = tq(0.95, wk.length - 2);
        const weeklyLow = Math.round(cmAt(target, eps - tc * seEps) - cmAt(price, eps - tc * seEps));
        const weeklyHigh = Math.round(cmAt(target, eps + tc * seEps) - cmAt(price, eps + tc * seEps));
        if (weekly < 5000) continue;
        F.push({
          id: `F-PRC-${slug(L.id)}-${slug(m.id)}`,
          detector: "D5 · Price below the contribution-maximising point",
          detectorCode: "PRC",
          domain: "Menu",
          lever: "menu_price",
          family: "B",
          loc: L.id,
          locs: [L.id],
          daypart: null,
          dow: null,
          scopeKey: `${L.id}|item:${m.id}`,
          account: "4010 · Food sales",
          equations: ["B2", "B6", "B7", "B4"],
          feeds: ["toast_orders", "recipes"],
          items: [m.id],
          title: `${m.name} is priced below where its own contribution peaks`,
          plain: `${m.name} sells at ${formatUsd(price, { dp: 2 })} at ${L.short}. Its own price history across ${prices.length} prices puts elasticity at ${eps.toFixed(2)} ± ${(tc * seEps).toFixed(2)}, and contribution is still rising at that price.`,
          onset: null,
          observed: { metric: "Price vs the recommended step", actual: price, baseline: target, unit: "cents_per_unit", periodLabel: `${wk.length} weeks, ${prices.length} distinct prices` },
          exposureCents: weekly,
          projectedLowCents: weeklyLow,
          projectedHighCents: weeklyHigh,
          series: wk.map((p) => ({ date: p.date, v: p.units })),
          chartBaselineN: null,
          evidenceCount: wk.length,
          cadenceDays: 7,
          causes: [
            { cause: "Price has not moved with the recipe cost since the last card revision", p: 0.66, sep: "Price history against recipe-cost effective dates" },
            { cause: "Anchored to a competitor price that has since moved", p: 0.21, sep: "Comparable items at the two nearest comparable rooms" },
            { cause: "Deliberate loss-leader, never revisited", p: 0.13, sep: "Attachment rate — does it pull other items onto the check?" },
          ],
          remedy: {
            change: `Move ${m.name} from ${formatUsd(price, { dp: 2 })} to ${formatUsd(target, { dp: 2 })} at ${L.short}, effective the next menu print`,
            alternatives: [`Move halfway to ${formatUsd(Math.round((price + target) / 2 / 25) * 25, { dp: 2 })} and re-measure`, "Hold the price and cut the recipe cost instead"],
            effort: 0.5,
            risk: "medium",
            latencyDays: 14,
            artifact: "A priced menu revision and a Toast price change staged for the effective date",
          },
          guardrails: ["covers", "check_average", "net_sales"],
          contraindications: ["Do not move more than one item in the same category in the same window — the control set needs unrepriced comparables"],
          autonomy: "A2",
          extra: {
            elasticity: { eps, se: seEps, tcrit: tc, prices, pStar, target, extrapolating, maxObserved, unitsNow, unitsAt: unitsNow * Math.pow(target / price, eps), cost, price, dpi },
            note: extrapolating
              ? `p* computes to ${formatUsd(pStar, { dp: 2 })}, outside the price range this room has ever charged. It is reported, not recommended: the markup rule has a pole at ε = −1. The recommended step is bounded at +8%.`
              : "The recommended step is bounded at the lesser of p*, +8% and 1.25× the highest observed price.",
          },
        });
      }
    }
  }

  /* ---- D6 · Mix shift against the house (B9) ------------------------------ */
  if (HAS_COST) {
    for (const L of reg.locations) {
      const recentW = weeksBack(8);
      const priorW = weeksBack(16);
      const rows = reg.itemDays.filter((r) => r.loc === L.id && r.date >= priorW);
      const pre = rows.filter((r) => r.date < recentW);
      const post = rows.filter((r) => r.date >= recentW);
      if (pre.length < 200 || post.length < 200) continue;
      // The group's own mix move over the same weeks is netted out: a special the whole
      // group ran is not one room's drift.
      const peerRows = reg.itemDays.filter((r) => r.loc !== L.id && r.date >= priorW);
      const peerPre = peerRows.filter((r) => r.date < recentW);
      const peerPost = peerRows.filter((r) => r.date >= recentW);
      const agg = (rs: typeof rows) => {
        const m = groupBy(rs, (r) => r.item);
        const tot = sum(rs.map((r) => r.units));
        const o: Record<string, { share: number; cm: number; units: number }> = {};
        for (const [k, v] of m) o[k] = { share: sum(v.map((r) => r.units)) / tot, cm: mean(v.map((r) => r.priceCents - r.costCents)), units: sum(v.map((r) => r.units)) };
        return o;
      };
      const A = agg(pre);
      const B = agg(post);
      const AP = peerPre.length ? agg(peerPre) : null;
      const BP = peerPost.length ? agg(peerPost) : null;
      const drivers: Array<{ item: string; name: string; dShare: number; dCm: number; mixEffect: number; cmEffect: number; crossEffect: number; shareNow: number; sharePre: number }> = [];
      let mixEff = 0;
      let cmEff = 0;
      let crossEff = 0;
      for (const m of reg.menu) {
        const a = A[m.id] ?? { share: 0, cm: 0, units: 0 };
        const b = B[m.id] ?? { share: 0, cm: 0, units: 0 };
        const peerShift = AP && BP ? (BP[m.id]?.share ?? 0) - (AP[m.id]?.share ?? 0) : 0;
        const dShare = b.share - a.share - peerShift;
        const dCm = b.cm - a.cm;
        const me = dShare * a.cm;
        const ce = b.share * dCm;
        const xe = dShare * dCm;
        mixEff += me;
        cmEff += ce;
        crossEff += xe;
        drivers.push({ item: m.id, name: m.name, dShare, dCm, mixEffect: me, cmEffect: ce, crossEffect: xe, shareNow: b.share, sharePre: a.share });
      }
      const perItem = mixEff; // cents per item sold
      const weeklyUnits = sum(post.map((r) => r.units)) / 8;
      const weekly = Math.round(perItem * weeklyUnits);
      if (weekly > -9000) continue; // only a mix drifting AGAINST the house
      drivers.sort((a, b) => a.mixEffect - b.mixEffect);
      const top = drivers[0] as (typeof drivers)[number];
      F.push({
        id: `F-MIX-${slug(L.id)}`,
        detector: "D6 · Mix shift decomposition",
        detectorCode: "MIX",
        domain: "Menu",
        lever: "mix_shift",
        family: "B",
        loc: L.id,
        locs: [L.id],
        daypart: null,
        dow: null,
        scopeKey: `${L.id}|mix`,
        account: "4010 · Food sales",
        equations: ["B9", "B4", "B2"],
        feeds: ["toast_orders", "recipes"],
        title: "The mix has drifted toward lower-margin plates",
        plain: `At ${L.short} the mix moved ${formatUsd(-perItem, { dp: 2 })} of contribution per item sold over eight weeks, net of what the other rooms' mix did. ${top.name} is most of it.`,
        onset: null,
        observed: { metric: "Contribution per item sold, mix effect only", actual: top.shareNow, baseline: top.sharePre, unit: "ratio", periodLabel: "8 weeks vs the prior 8" },
        exposureCents: Math.abs(weekly),
        series: [],
        chartBaselineN: null,
        evidenceCount: 8,
        cadenceDays: 7,
        causes: [
          { cause: `${top.name} lost menu position or server mention`, p: 0.48, sep: "Attachment by server and by section over the same weeks" },
          { cause: "A seasonal special is cannibalising the higher-margin plate", p: 0.33, sep: "Units of the special against the decline, week by week" },
          { cause: "Genuine guest preference shift", p: 0.19, sep: "The same item at the other two rooms over the same period" },
        ],
        remedy: {
          change: `Move ${top.name} back above the fold on the printed menu and add it to the pre-shift mention list for two weeks`,
          alternatives: ["Re-engineer the plate so the drift does not matter", "Reprice the item the mix moved toward"],
          effort: 1.0,
          risk: "low",
          latencyDays: 7,
          artifact: "A menu layout revision and a two-week pre-shift script",
        },
        guardrails: ["covers", "net_sales"],
        contraindications: [],
        autonomy: "A1",
        claimCeiling: "modelled", // Doctrine 5: mix shift is never billable
        extra: { decomposition: { mixEffectCents: Math.round(mixEff * weeklyUnits), cmEffectCents: Math.round(cmEff * weeklyUnits), crossEffectCents: Math.round(crossEff * weeklyUnits), drivers: drivers.slice(0, 6) } },
      });
    }
  }

  /* ---- D7 · Ticket-time drift, valued through the constrained share ------- */
  if (HAS_TICKET) {
    for (const L of reg.locations) {
      for (const dp of dayparts) {
        const sv = reg.services.filter((s) => s.loc === L.id && s.daypart === dp.id && s.date >= weeksBack(26));
        if (sv.length < 40) continue;
        const series = sv.map((s) => ({ date: s.date, v: s.ticketMin }));
        const cus = cusumChart(series, { baselineN: 28 });
        const onset = driftOnset(cus, { direction: "high" });
        if (!onset || onset.direction !== "high") continue;
        const post = series.filter((p) => p.date >= onset.signalDate);
        const pre = series.filter((p) => p.date < onset.onsetDate);
        if (post.length < 8 || pre.length < 12) continue;
        const t1 = mean(post.map((p) => p.v));
        const t0 = mean(pre.map((p) => p.v));
        if (t1 - t0 < 1.5) continue;
        const constrainedShare = mean(sv.filter((s) => s.date >= weeksBack(8)).map((s) => s.constrainedShare));
        const rs8 = reg.itemDays.filter((r) => r.loc === L.id && r.date >= weeksBack(8));
        const cm = sum(rs8.map((r) => r.units * (r.priceCents - r.costCents)));
        const cv = sum(reg.services.filter((s) => s.loc === L.id && s.date >= weeksBack(8)).map((s) => s.covers));
        const cmPerCover = cv ? cm / cv : 0;
        const turnsRecovered = ((t1 - t0) / 60) * 0.8;
        const weeklyCovers = sum(sv.filter((s) => s.date >= weeksBack(1)).map((s) => s.covers));
        const weekly = Math.round(turnsRecovered * constrainedShare * cmPerCover * weeklyCovers * 0.35);
        const feed = feedFor("reservations");
        const blockedBy = feed?.stale ? { feed: "reservations", ageDays: feed.ageDays, why: `Reservations has not refreshed since ${formatDate(feed.newest)}. The unmet-demand bound cannot be computed, so this cannot be sized.` } : null;
        F.push({
          id: `F-TKT-${slug(L.id)}-${slug(dp.id)}`,
          detector: "D7 · Ticket-time drift",
          detectorCode: "TKT",
          domain: "Throughput",
          lever: "ticket_time",
          family: "B",
          loc: L.id,
          locs: [L.id],
          daypart: dp.id,
          dow: null,
          scopeKey: `${L.id}|${dp.id}|ticket`,
          account: "4010 · Food sales",
          equations: ["D1", "D3", "E3", "B4"],
          feeds: ["kds", "reservations", "toast_orders"],
          title: `${dp.label} tickets are running ${(t1 - t0).toFixed(1)} minutes longer than they were`,
          plain:
            constrainedShare < 0.05
              ? `${L.short} ${dp.label.toLowerCase()} tickets are ${(t1 - t0).toFixed(1)} minutes slower since ${formatDate(onset.onsetDate)}. The room is only constrained ${formatPct(constrainedShare, 0)} of the time, so a faster turn is worth close to nothing here — this is a service-quality finding, not a money one.`
              : `${L.short} ${dp.label.toLowerCase()} tickets are ${(t1 - t0).toFixed(1)} minutes slower since ${formatDate(onset.onsetDate)}, and the room is constrained ${formatPct(constrainedShare, 0)} of the time — so the minutes are worth something.`,
          onset,
          observed: { metric: "Ticket time, minutes", actual: t1, baseline: t0, unit: "minutes", periodLabel: `${post.length} services` },
          exposureCents: Math.max(0, weekly),
          series,
          chartBaselineN: 28,
          evidenceCount: post.length,
          cadenceDays: 1,
          blockedBy,
          causes: [
            { cause: "A station is the constraint — expo or the grill", p: 0.51, sep: "Fire-to-ready by station on the KDS" },
            { cause: "Prep shortfall pushing work onto the line during service", p: 0.28, sep: "Prep completion times against the first fire" },
            { cause: "Menu change added a longer-cook item to the mix", p: 0.21, sep: "Ticket time by item composition" },
          ],
          remedy: {
            change: "Station-level timing study on two dinner services, then re-sequence the fire order",
            alternatives: ["Add a half prep shift and re-measure", "Pull the longest-cook item off the dinner menu"],
            effort: 3.0,
            risk: "low",
            latencyDays: 14,
            artifact: "A timing sheet by station and a revised fire sequence",
          },
          guardrails: ["ticket_time", "rating", "overtime"],
          contraindications: [],
          autonomy: "A1",
          extra: { constrainedShare, cmPerCover, deltaMin: t1 - t0 },
        });
      }
    }
  }

  return F;
}

/* ---------- qualification — the gate between "a detector fired" and "a dollar may show" */

export interface QualificationTest {
  id: "data" | "feasibility" | "recoverability" | "overlap";
  label: string;
  pass: boolean;
  detail: string;
}
export interface Qualification {
  pass: boolean;
  tests: QualificationTest[];
  completeness: number;
  staleFeeds: string[];
}

export interface OverlapFields {
  overlapStatus: "none" | "holds" | "reduced" | "unresolved";
  overlapDeductionCents: number;
  overlapRefs: Array<{ id: string; rule: string; cents: number; role?: string }>;
}

/** Recoverable = exposure minus what is structurally unrecoverable for the lever, minus overlap. */
export function recoverableOf(f: { exposureCents: number; lever: Lever; overlapDeductionCents?: number }): Cents {
  return Math.max(0, Math.round(f.exposureCents * leverMeta(f.lever).recoveryFactor) - (f.overlapDeductionCents ?? 0));
}

export function qualify(f: FindingCore & Partial<OverlapFields>, feeds: readonly FeedHealth[]): Qualification {
  const feedsFor = f.feeds.map((id) => feeds.find((x) => x.id === id)).filter((x): x is FeedHealth => !!x);
  const stale = feedsFor.filter((x) => x.stale);
  const completeness = feedsFor.length ? mean(feedsFor.map((x) => x.completeness)) : 0;
  const tests: QualificationTest[] = [
    {
      id: "data",
      label: "Data sufficiency",
      pass: f.evidenceCount >= 6 && completeness >= 0.9 && !stale.length,
      detail: stale.length ? `${stale.map((s) => s.name).join(", ")} is ${stale[0]?.ageDays} days old against a ${stale[0]?.slaHours}h freshness rule.` : `${f.evidenceCount} observations; source completeness ${formatPct(completeness, 1)} across ${feedsFor.length} feeds.`,
    },
    { id: "feasibility", label: "Operational feasibility", pass: f.remedy.effort <= 6 && f.remedy.risk !== "blocked", detail: `${f.remedy.effort}h of operator time, ${f.remedy.risk} operational risk, artefact available.` },
    { id: "recoverability", label: "Recoverability", pass: f.exposureCents >= 6000, detail: `Recoverable portion estimated at ${formatUsd(recoverableOf(f))}/wk after removing what demand or capacity makes unrecoverable.` },
    {
      id: "overlap",
      label: "Overlap",
      pass: f.overlapStatus !== "unresolved",
      detail: f.overlapStatus === "reduced" ? `Intersects an open claim; reduced by ${formatUsd(f.overlapDeductionCents ?? 0)}/wk under precedence rule ${f.overlapRefs?.[0]?.rule ?? "3"}.` : "No open or verified claim shares this scope, period and account.",
    },
  ];
  return { pass: tests.every((t) => t.pass), tests, completeness, staleFeeds: stale.map((s) => s.id) };
}

/** F2 — expected value per hour of operator effort, on a labelled portfolio prior. */
export function evPerHour(recoverableCents: number, lever: Lever, effortHours: number): number {
  const prior = leverMeta(lever).prior;
  return Math.round((recoverableCents * prior.pVerify * 0.85) / Math.max(effortHours, 0.25));
}
