import { describe, expect, it } from "vitest";
import { ApiError, ApiRequestError, apiFetch, CompleteActionBody, HealthResponse, Kpi, QueueCard } from "../src/index";

const contract = {
  definition: "Persistent verified savings",
  dateRange: "1 Sep 2026 – 14 Sep 2026 · FY2026 P9",
  locationScope: "All 3 rooms. None excluded.",
  status: "Counts verified, persistent and reconciled claims only.",
  confidence: "Bookable",
  freshness: "Newest contributing business date 14 Sep 2026.",
  lineage: "Toast orders · Toast labour",
  drillTo: "persistence cohorts",
  changeExplanation: "Period-over-period comparison is available once a second closed period exists.",
  calcVersion: "equations v1.0 · policy v1.0 · ranking policy v1.0",
};

describe("engine records", () => {
  it("parses a Money-valued and a ratio-valued Kpi", () => {
    const money = Kpi.parse({ id: "persistent", label: "Persistent verified savings", value: { cents: 123400, klass: "bookable" }, klass: "Bookable", definition: "d", drillTo: "x", read: "r", hero: true, contract });
    expect(money.value).toEqual({ cents: 123400, klass: "bookable" });
    const ratio = Kpi.parse({ id: "multiple", label: "Verified value multiple", value: 4.2, klass: "Bookable", definition: "d", drillTo: "x", read: "r", isRatio: true, contract });
    expect(ratio.value).toBe(4.2);
  });
  it("refuses float cents and an unknown claim class", () => {
    expect(Kpi.safeParse({ id: "k", label: "l", value: { cents: 12.5, klass: "bookable" }, klass: "Bookable", definition: "d", drillTo: "x", read: "r", contract }).success).toBe(false);
    expect(Kpi.safeParse({ id: "k", label: "l", value: { cents: 12, klass: "savings" }, klass: "Bookable", definition: "d", drillTo: "x", read: "r", contract }).success).toBe(false);
  });
  it("parses a minimal QueueCard and rejects a bad business date", () => {
    const card = { id: "QA-A-01", type: "action_due", label: "Actions due", act: "Mark done with evidence", who: "Owner", rank: 5, title: "Publish the schedule", body: "Maria · due 16 Sep", ref: { kind: "action", id: "A-01" }, loc: "oak", dueOn: "2026-09-16", overdue: false };
    expect(QueueCard.parse(card).dueOn).toBe("2026-09-16");
    expect(QueueCard.safeParse({ ...card, dueOn: "16/09/2026" }).success).toBe(false);
  });
});

describe("route schemas", () => {
  it("parses ApiError with and without details", () => {
    expect(ApiError.parse({ error: "not_found", message: "No such finding" })).toEqual({ error: "not_found", message: "No such finding" });
    expect(ApiError.parse({ error: "bad_request", message: "x", details: { path: ["decision"] } }).details).toEqual({ path: ["decision"] });
  });
  it("defaults evidence.resolved to true on the complete-action body", () => {
    const parsed = CompleteActionBody.parse({ evidence: [{ type: "7shifts publish receipt", detail: "weeks 38–40" }] });
    expect(parsed.evidence[0]?.resolved).toBe(true);
  });
});

describe("apiFetch", () => {
  const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  it("parses a 2xx body with the given schema", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { ok: true, version: "1.0.0", db: "ok" });
    };
    const health = await apiFetch(HealthResponse, "/api/v1/health", { baseUrl: "http://api.test", fetchImpl });
    expect(health).toEqual({ ok: true, version: "1.0.0", db: "ok" });
    expect(calls[0]?.url).toBe("http://api.test/api/v1/health");
    expect(calls[0]?.init?.credentials).toBe("include");
  });
  it("throws ApiRequestError carrying the ApiError body on a non-2xx", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(404, { error: "not_found", message: "No such finding", details: { id: "F-X" } });
    const err = await apiFetch(HealthResponse, "/api/v1/findings/F-X", { fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    const e = err as ApiRequestError;
    expect(e.status).toBe(404);
    expect(e.error).toBe("not_found");
    expect(e.message).toBe("No such finding");
    expect(e.details).toEqual({ id: "F-X" });
  });
  it("throws when a 2xx body does not match the schema", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(200, { ok: true, version: 1 });
    await expect(apiFetch(HealthResponse, "/api/v1/health", { fetchImpl })).rejects.toThrow();
  });
});
