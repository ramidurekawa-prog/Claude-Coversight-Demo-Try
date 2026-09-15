import { rmSync } from "node:fs";
import { connectDatabase, DEFAULT_PGLITE_DIR } from "../connect";
import { seedDemo } from "../seed";

process.env.STREAMLINE_FAST_HASH ??= "1";
if (!process.env.DATABASE_URL) rmSync(DEFAULT_PGLITE_DIR, { recursive: true, force: true });
const conn = await connectDatabase();
const r = await seedDemo(conn.db, { force: true });
console.log(`[db] reset ${conn.kind}: rosewood ${r.rosewood}, harbor ${r.harbor}, ${r.personas} personas`);
await conn.close();
