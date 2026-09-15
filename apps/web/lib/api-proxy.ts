/**
 * Same-origin proxy to the API: the browser only ever talks to this app, these
 * handlers relay to apps/api server-side, so no CORS machinery exists anywhere
 * and the session cookie stays first-party.
 */
const FORWARDED_REQUEST_HEADERS = ["cookie", "content-type", "origin", "user-agent", "accept"];
const STRIPPED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding"]);

export const API_URL = () => process.env.API_URL ?? "http://localhost:3001";

export async function proxyToApi(request: Request, { apiUrl = API_URL(), fetchImpl = globalThis.fetch }: { apiUrl?: string; fetchImpl?: typeof globalThis.fetch } = {}): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, apiUrl);
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let upstream: Response;
  try {
    upstream = await fetchImpl(target.toString(), { method: request.method, headers, ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.text() }), redirect: "manual" });
  } catch {
    return new Response(JSON.stringify({ error: "api_unreachable", message: "The API is not reachable. Start it with `pnpm dev` (it listens on :3001)." }), { status: 502, headers: { "content-type": "application/json" } });
  }
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name === "set-cookie" || STRIPPED_RESPONSE_HEADERS.has(name)) return;
    responseHeaders.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
  return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
}
