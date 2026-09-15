import { onTestFinished } from "vitest";
import { connectDatabase } from "./connect.js";
import type { StreamlineDb } from "./repositories.js";

/** An empty in-memory Postgres (PGlite) with every migration applied; closed when the test finishes. */
export async function freshDb(): Promise<StreamlineDb> {
  const conn = await connectDatabase({ dataDir: "memory", url: undefined });
  onTestFinished(() => conn.close());
  return conn.db;
}
