/**
 * The host layer's two decisions: whether to embed the API, and what to serve
 * when embedding it fails.
 *
 * The second one is the more important. A deployment whose boot fails used to
 * answer every request with an empty 500 — including /api/v1/health, the one
 * route whose job is to say what is wrong — because the failure happened before
 * any route existed. That is the difference between a founder reading "set
 * DATABASE_URL" and reading "a server error occurred".
 */
import { HealthResponse } from "@streamline/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = ["NETLIFY", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "FUNCTIONS_WORKER_RUNTIME", "STREAMLINE_EMBEDDED_API", "API_URL", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

describe("isEmbedded", () => {
  it("embeds on a serverless host, proxies locally, and obeys the flag either way", async () => {
    const { isEmbedded } = await import("../lib/embedded-api");
    expect(isEmbedded()).toBe(false);
    process.env.NETLIFY = "true";
    expect(isEmbedded()).toBe(true);
    // Something is listening: proxy to it rather than embedding a second copy.
    process.env.API_URL = "http://localhost:3001";
    expect(isEmbedded()).toBe(false);
    process.env.STREAMLINE_EMBEDDED_API = "1";
    expect(isEmbedded()).toBe(true);
    process.env.STREAMLINE_EMBEDDED_API = "0";
    expect(isEmbedded()).toBe(false);
  });
});

describe("a boot that fails still explains itself", () => {
  it("serves health with a diagnosis, and 503 with the reason everywhere else", async () => {
    process.env.NETLIFY = "true"; // serverless host, and no DATABASE_URL: the boot cannot succeed
    const { embeddedApi } = await import("../lib/embedded-api");

    const health = await embeddedApi(new Request("http://site.test/api/v1/health"));
    expect(health.status).toBe(200);
    const body = HealthResponse.parse(await health.json());
    expect(body.database?.configured).toBe(false);
    expect(body.diagnosis).toMatch(/DATABASE_URL is not set/);
    expect(body.diagnosis).toMatch(/pnpm db:seed/);

    const me = await embeddedApi(new Request("http://site.test/api/v1/me"));
    expect(me.status).toBe(503);
    expect(((await me.json()) as { message: string }).message).toMatch(/DATABASE_URL is not set/);
  });
});
