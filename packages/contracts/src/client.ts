/**
 * The thin parsing client. Fetches a route, raises `ApiRequestError` on a
 * non-2xx status (decoding the body as `ApiError` when it is one), and
 * returns the body parsed by the schema the caller names. No framework
 * imports: it runs in the browser, in a Next server component, and in tests.
 */
import type { z } from "zod";
import { ApiError } from "./api.js";

export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  constructor(
    readonly status: number,
    readonly error: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiFetchInit extends RequestInit {
  /** Prefix for `path`; empty (same origin, proxied) by default. */
  baseUrl?: string;
  /** Override the global fetch (tests, server-side calls with a custom agent). */
  fetchImpl?: typeof fetch;
}

/** Decode a response body as JSON when it is JSON, otherwise keep the text (or null when empty). */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiFetch<T>(schema: z.ZodType<T>, path: string, init: ApiFetchInit = {}): Promise<T> {
  const { baseUrl, fetchImpl, headers: initHeaders, ...rest } = init;
  const doFetch = fetchImpl ?? fetch;
  const headers = new Headers(initHeaders);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (rest.body != null && !headers.has("content-type")) headers.set("content-type", "application/json");

  const res = await doFetch(`${baseUrl ?? ""}${path}`, { credentials: "include", ...rest, headers });
  const body = await readBody(res);

  if (!res.ok) {
    const known = ApiError.safeParse(body);
    if (known.success) throw new ApiRequestError(res.status, known.data.error, known.data.message, known.data.details);
    throw new ApiRequestError(res.status, "http_error", `${res.status} ${res.statusText}`.trim(), body);
  }
  return schema.parse(body);
}
