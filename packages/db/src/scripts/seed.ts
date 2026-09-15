import { connectDatabase } from "../connect.js";
import { seedDemo } from "../seed.js";

process.env.STREAMLINE_FAST_HASH ??= "1";
const conn = await connectDatabase();
const t0 = Date.now();
const r = await seedDemo(conn.db, { force: process.argv.includes("--force") });
console.log(`[db] ${conn.kind}: rosewood ${r.rosewood}, harbor ${r.harbor}, ${r.personas} personas (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
await conn.close();
