import { connectDatabase } from "../connect";
import { seedDemo } from "../seed";

// Local PGlite is re-seeded constantly and its passwords are published with the
// fixture; a real server gets the full-strength profile.
if (!process.env.DATABASE_URL) process.env.STREAMLINE_FAST_HASH ??= "1";
const conn = await connectDatabase();
const t0 = Date.now();
const r = await seedDemo(conn.db, { force: process.argv.includes("--force") });
console.log(`[db] ${conn.kind}: rosewood ${r.rosewood}, harbor ${r.harbor}, ${r.personas} personas (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
await conn.close();
