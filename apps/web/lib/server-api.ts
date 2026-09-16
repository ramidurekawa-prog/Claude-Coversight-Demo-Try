import { apiFetch, ApiRequestError, MeResponse } from "@streamline/contracts";
import type { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { embeddedApi, isEmbedded, publicOrigin } from "./embedded-api";

/**
 * Typed API call from a server component, carrying the request's session cookie.
 *
 * Embedded (serverless): the request is handed to the in-process API directly,
 * so rendering a page costs no second HTTP hop and no second function
 * invocation. Otherwise it goes over HTTP to the API process.
 */
export async function serverApi<T>(schema: z.ZodType<T>, path: string, init: RequestInit = {}): Promise<T> {
  const cookie = (await cookies()).toString();
  const headers = { ...(init.headers as Record<string, string> | undefined), ...(cookie ? { cookie } : {}) };
  if (isEmbedded()) {
    return apiFetch(schema, path, { ...init, baseUrl: publicOrigin(), headers, cache: "no-store", fetchImpl: (input, requestInit) => embeddedApi(new Request(input as RequestInfo, requestInit)) });
  }
  return apiFetch(schema, path, { ...init, baseUrl: process.env.API_URL ?? "http://localhost:3001", headers, cache: "no-store" });
}

/** Every shell page requires a session; nobody signed in is sent to /login. */
export async function requireSession(): Promise<MeResponse> {
  try {
    return await serverApi(MeResponse, "/api/v1/me");
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) redirect("/login");
    throw error;
  }
}

/** The `scope` query value a page should send: "all" or a location code. */
export function scopeParam(sp: Record<string, string | string[] | undefined>): string | undefined {
  const v = sp.scope;
  return Array.isArray(v) ? v[0] : v;
}

export function withScope(path: string, scope: string | undefined): string {
  if (!scope || scope === "all") return path;
  return `${path}${path.includes("?") ? "&" : "?"}scope=${encodeURIComponent(scope)}`;
}
