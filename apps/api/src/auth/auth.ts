import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { accounts, authVerifications, hashPassword, sessions, users, verifyPassword, type StreamlineDb } from "@streamline/db";
import { betterAuth } from "better-auth";
import { v7 as uuidv7 } from "uuid";

export interface AuthConfig {
  secret: string;
  /** Public origin of this API. */
  baseURL: string;
  /** Public origin of the web app — the trusted Origin for browser requests arriving via the proxy. */
  appBaseUrl: string;
}

/**
 * better-auth answers only "who is this?": sessions in our Postgres via the
 * Drizzle adapter, email + password with argon2id. Roles and tenancy live in
 * the repository layer, never here. Invite-only: sign-up is not mounted.
 */
export function createAuth(db: StreamlineDb, cfg: AuthConfig) {
  return betterAuth({
    secret: cfg.secret,
    baseURL: cfg.baseURL,
    basePath: "/api/v1/auth",
    trustedOrigins: [cfg.appBaseUrl, cfg.baseURL],
    database: drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions, account: accounts, verification: authVerifications } }),
    advanced: { database: { generateId: () => uuidv7() } },
    emailAndPassword: { enabled: true, minPasswordLength: 8, password: { hash: hashPassword, verify: verifyPassword } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  });
}

export type Auth = ReturnType<typeof createAuth>;
