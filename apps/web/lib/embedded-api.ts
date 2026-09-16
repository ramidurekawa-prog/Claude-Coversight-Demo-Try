/**
 * The API, hosted inside this app's own Node runtime.
 *
 * On a serverless host there is no second process to proxy to, so the same
 * Fastify app that `apps/api` serves locally is built once per instance and
 * driven through `inject()` — the identical entry point the API's own tests
 * use. The UI is unaffected: it still speaks HTTP to /api/v1/* and never
 * touches the database or the fixture itself.
 *
 * Set STREAMLINE_EMBEDDED_API=1 to use this path; otherwise requests are
 * proxied to API_URL (the two-process layout used by `pnpm dev`).
 */
import { buildApp } from "@streamline/api/app";
import { connectDatabase } from "@streamline/db";

/** The Fastify instance, typed from the builder so the web app needs no Fastify dependency of its own. */
type ApiApp = ReturnType<typeof buildApp>;

export const isEmbedded = () => process.env.STREAMLINE_EMBEDDED_API === "1";

/** The public origin of this deployment: Netlify sets URL and DEPLOY_PRIME_URL. */
export function publicOrigin(): string {
  return process.env.APP_BASE_URL ?? process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? "http://localhost:3000";
}

let instance: Promise<ApiApp> | null = null;

function start(): Promise<ApiApp> {
  return (async () => {
    // One small pool per instance: a serverless platform runs many of them.
    const conn = await connectDatabase({ poolMax: Number(process.env.STREAMLINE_PG_POOL_MAX ?? 1) });
    const origin = publicOrigin();
    const app = buildApp({
      db: conn.db,
      dbPing: conn.ping,
      authConfig: {
        secret: process.env.BETTER_AUTH_SECRET ?? "insecure-dev-only-secret-change-me",
        // Same origin as the UI now, so the session cookie is first-party by construction.
        baseURL: origin,
        appBaseUrl: origin,
        // A Netlify deploy preview is served from its own host; trust it too, or
        // sign-in there is refused for a mismatched Origin.
        extraTrustedOrigins: [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.APP_BASE_URL].filter((u): u is string => !!u),
      },
    });
    await app.ready();
    return app;
  })();
}

/** Reused across warm invocations; a failed boot is not cached. */
function getApp(): Promise<ApiApp> {
  if (!instance) {
    instance = start().catch((err: unknown) => {
      instance = null;
      throw err;
    });
  }
  return instance;
}

const HOP_BY_HOP = new Set(["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive"]);

export async function embeddedApi(request: Request): Promise<Response> {
  const app = await getApp();
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name)) headers[name] = value;
  });
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const payload = hasBody ? await request.text() : undefined;

  const injected = await app.inject({
    method: request.method as "GET" | "POST" | "DELETE" | "PUT" | "PATCH",
    url: url.pathname + url.search,
    headers,
    ...(payload !== undefined ? { payload } : {}),
  });

  const out = new Headers();
  for (const [name, value] of Object.entries(injected.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue;
    // Several Set-Cookie headers must stay several headers, not one comma-joined string.
    if (Array.isArray(value)) for (const v of value) out.append(name, String(v));
    else out.set(name, String(value));
  }
  // rawPayload is a Node Buffer; hand the Response its bytes.
  const body = injected.statusCode === 204 || !injected.rawPayload?.length ? null : new Uint8Array(injected.rawPayload);
  return new Response(body, { status: injected.statusCode, headers: out });
}
