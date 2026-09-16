/**
 * The API, hosted inside this app's own Node runtime.
 *
 * On a serverless host there is no second process to proxy to, so the same
 * Fastify app that `apps/api` serves locally is built once per instance and
 * driven through `inject()` — the identical entry point the API's own tests
 * use. The UI is unaffected: it still speaks HTTP to /api/v1/* and never
 * touches the database or the fixture itself.
 *
 * This path is used automatically wherever there is no second process to proxy
 * to — any serverless host, unless API_URL names one. STREAMLINE_EMBEDDED_API
 * forces the choice either way (1 = embed, 0 = proxy).
 */
import { buildApp } from "@streamline/api/app";
import { connectDatabase } from "@streamline/db";

/** The Fastify instance, typed from the builder so the web app needs no Fastify dependency of its own. */
type ApiApp = ReturnType<typeof buildApp>;

/** Hosts that run this app as a function rather than a process, so nothing listens on API_URL. */
const SERVERLESS_HOST = () => !!(process.env.NETLIFY ?? process.env.VERCEL ?? process.env.AWS_LAMBDA_FUNCTION_NAME ?? process.env.FUNCTIONS_WORKER_RUNTIME);

/**
 * Embed unless there is something to proxy to. Deciding this by host rather
 * than by a remembered environment variable matters: when the flag was the only
 * signal, forgetting it on a deployment made every page fetch localhost:3001
 * and fail, and a production Next.js build redacts that message on its way to
 * the error boundary — so the whole site reads as an unexplained server error.
 */
export const isEmbedded = (): boolean => {
  const flag = process.env.STREAMLINE_EMBEDDED_API;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return SERVERLESS_HOST() && !process.env.API_URL;
};

/** The public origin of this deployment: Netlify sets URL and DEPLOY_PRIME_URL. */
export function publicOrigin(): string {
  return process.env.APP_BASE_URL ?? process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? "http://localhost:3000";
}

let instance: Promise<ApiApp> | null = null;
let degraded: Promise<ApiApp> | null = null;
let lastBootFailure = "The API could not start.";

/**
 * The same app without a database, served only when the real boot fails.
 *
 * Without this, a deployment that cannot reach its database answered every
 * request — including /api/v1/health, the one route whose job is to say what is
 * wrong — with an empty 500, because the failure happened before any route
 * existed. The health route needs no database to report that there isn't one,
 * so it is built and served, and everything else answers 503 with the reason
 * rather than Fastify's "Route not found".
 */
function degradedApp(reason: string): Promise<ApiApp> {
  // The app is built once, but the reason is read per request: the reason a boot
  // fails can change (a connection string appears, the database is still
  // unreachable) and a cached sentence would then be the wrong one.
  lastBootFailure = reason;
  degraded ??= (async () => {
    const app = buildApp({ deployment: "embedded" });
    app.setNotFoundHandler((_req, reply) => reply.code(503).send({ error: "unavailable", message: lastBootFailure }));
    await app.ready();
    return app;
  })();
  return degraded;
}

function start(): Promise<ApiApp> {
  return (async () => {
    // PGlite keeps its data in a file, which a serverless filesystem does not
    // preserve; say so plainly rather than failing somewhere inside the driver.
    if (SERVERLESS_HOST() && !process.env.DATABASE_URL) {
      const missing = "DATABASE_URL is not set. This host runs the app as a function, where PGlite's data file cannot survive, so a Postgres connection string is required. Set DATABASE_URL (use the pooled one), then seed it once from your machine: DATABASE_URL='...' pnpm db:seed";
      console.error(`[streamline] ${missing}`);
      throw new Error(missing);
    }
    // One small pool per instance: a serverless platform runs many of them.
    const conn = await connectDatabase({ poolMax: Number(process.env.STREAMLINE_PG_POOL_MAX ?? 1) });
    const origin = publicOrigin();
    const app = buildApp({
      deployment: "embedded",
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

/**
 * Reused across warm invocations. A failed boot is not cached — the next
 * request tries again, because a database that was unreachable for a moment
 * must not pin the instance into diagnostic mode — and until it succeeds the
 * request is answered by an app that can explain the failure.
 */
function getApp(): Promise<ApiApp> {
  instance ??= start().catch((err: unknown) => {
    instance = null;
    throw err;
  });
  return instance.catch((err: unknown) => degradedApp(err instanceof Error ? err.message : String(err)));
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
