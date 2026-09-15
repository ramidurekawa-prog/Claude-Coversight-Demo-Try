import { freshDb } from "@streamline/db/test-helpers";
import { seedDemo } from "@streamline/db";
import type { FastifyInstance } from "fastify";
import { onTestFinished } from "vitest";
import { buildApp } from "./app";

export async function createTestApp() {
  const db = await freshDb();
  await seedDemo(db);
  const app = buildApp({ db });
  await app.ready();
  onTestFinished(() => app.close());
  return { app, db };
}

/** Sign a seeded persona in and return the session cookie for inject(). */
export async function signIn(app: FastifyInstance, email: string, password = "streamline-demo-2026"): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in/email", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie : [setCookie ?? ""];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

export async function get<T = unknown>(app: FastifyInstance, cookie: string, url: string): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: "GET", url, headers: { cookie } });
  return { status: res.statusCode, body: res.json<T>() };
}

export async function post<T = unknown>(app: FastifyInstance, cookie: string, url: string, payload: unknown): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: "POST", url, headers: { cookie }, payload: payload as Record<string, unknown> });
  return { status: res.statusCode, body: res.json<T>() };
}
