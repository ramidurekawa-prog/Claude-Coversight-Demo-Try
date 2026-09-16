import { onTestFinished } from "vitest";
import { connectDatabase } from "./connect";
import type { StreamlineDb } from "./repositories";

/** An empty in-memory Postgres (PGlite) with every migration applied; closed when the test finishes. */
export async function freshDb(): Promise<StreamlineDb> {
  const conn = await connectDatabase({ dataDir: "memory", url: undefined });
  onTestFinished(() => conn.close());
  return conn.db;
}

/** An empty in-memory Postgres with NO migrations applied: the state of a hosted database nobody has seeded yet. */
export async function unmigratedDb(): Promise<StreamlineDb> {
  const conn = await connectDatabase({ dataDir: "memory", url: undefined, migrate: false });
  onTestFinished(() => conn.close());
  return conn.db;
}
