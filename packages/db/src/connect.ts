/**
 * One connection helper for every runtime.
 *
 * - No DATABASE_URL: PGlite, an in-process Postgres whose files live under
 *   packages/db/data/pglite. Zero services for local development and the demo.
 * - DATABASE_URL set: node-postgres against a real server. This is the only
 *   option on a serverless host, where the filesystem does not persist.
 *
 * PGlite is imported dynamically so its WebAssembly build never enters a
 * serverless bundle, and migrations can be skipped at runtime
 * (STREAMLINE_SKIP_MIGRATIONS=1) for a deployment that migrates from its
 * release step instead of racing on every cold start.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { StreamlineDb } from "./repositories";
import * as schema from "./schema";

// Joined rather than written as new URL("../x", import.meta.url): these are
// runtime paths, and a bundler reads that form as a static asset reference and
// fails the build looking for a module.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_FOLDER = join(PACKAGE_ROOT, "migrations");
export const DEFAULT_PGLITE_DIR = join(PACKAGE_ROOT, "data", "pglite");

export interface Connection {
  db: StreamlineDb;
  kind: "pglite" | "postgres";
  ping: () => Promise<void>;
  close: () => Promise<void>;
}

export interface ConnectOptions {
  /** Postgres URL; unset → PGlite. */
  url?: string | undefined;
  /** PGlite data directory; "memory" for an in-memory database (tests). */
  dataDir?: string | undefined;
  /** Apply migrations on connect. Default: true, unless STREAMLINE_SKIP_MIGRATIONS=1. */
  migrate?: boolean | undefined;
  /** Pool size for Postgres. Keep this at 1 on a serverless host: every warm instance holds its own pool. */
  poolMax?: number | undefined;
}

export async function connectDatabase(opts: ConnectOptions = {}): Promise<Connection> {
  const url = opts.url ?? process.env.DATABASE_URL;
  const shouldMigrate = opts.migrate ?? process.env.STREAMLINE_SKIP_MIGRATIONS !== "1";
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: opts.poolMax ?? Number(process.env.STREAMLINE_PG_POOL_MAX ?? 10), ...(/\bsslmode=require\b/.test(url) ? { ssl: { rejectUnauthorized: true } } : {}) });
    const db = drizzleNodePg(pool, { schema });
    if (shouldMigrate) await migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return {
      db,
      kind: "postgres",
      ping: async () => {
        await pool.query("select 1");
      },
      close: () => pool.end(),
    };
  }
  const { mkdirSync } = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate: migratePglite } = await import("drizzle-orm/pglite/migrator");
  const dir = opts.dataDir ?? process.env.STREAMLINE_PGLITE_DIR ?? DEFAULT_PGLITE_DIR;
  const client = dir === "memory" ? new PGlite() : (mkdirSync(dir, { recursive: true }), new PGlite(dir));
  const db = drizzlePglite(client, { schema });
  if (shouldMigrate) await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    kind: "pglite",
    ping: async () => {
      await client.query("select 1");
    },
    close: () => client.close(),
  };
}
