/**
 * One connection helper for every runtime: PGlite (in-process Postgres, files
 * under packages/db/data/pglite) when DATABASE_URL is unset; node-postgres
 * otherwise. Migrations are applied on connect, so a fresh clone works with
 * `pnpm db:seed && pnpm dev` and nothing else.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import type { StreamlineDb } from "./repositories";
import * as schema from "./schema";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));
export const DEFAULT_PGLITE_DIR = fileURLToPath(new URL("../data/pglite", import.meta.url));

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
}

export async function connectDatabase(opts: ConnectOptions = {}): Promise<Connection> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzleNodePg(pool, { schema });
    await migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return {
      db,
      kind: "postgres",
      ping: async () => {
        await pool.query("select 1");
      },
      close: () => pool.end(),
    };
  }
  const dir = opts.dataDir ?? process.env.STREAMLINE_PGLITE_DIR ?? DEFAULT_PGLITE_DIR;
  const client = dir === "memory" ? new PGlite() : (mkdirSync(dir, { recursive: true }), new PGlite(dir));
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    kind: "pglite",
    ping: async () => {
      await client.query("select 1");
    },
    close: () => client.close(),
  };
}
