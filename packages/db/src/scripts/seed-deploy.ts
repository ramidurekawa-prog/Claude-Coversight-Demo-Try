/**
 * The seed, run from the deployment's build step.
 *
 * A serverless function has ten seconds; the build has fifteen minutes, full
 * Node and the same environment variables, so this is where a hosted database
 * gets its tables and its fixture. It means a founder needs no terminal: set
 * the connection string on the site (or add the host's own database), deploy,
 * and the site comes up seeded.
 *
 * Idempotent by construction — `seedDemo` no-ops when the fixture version and
 * register fingerprint already match — so every deploy can run it.
 */
import { connectDatabase, migrationUrl } from "../connect";
import { seedDemo } from "../seed";

const url = migrationUrl();

// No database configured: the build still has to produce a site, and that site
// now explains the problem itself on every page and on /api/v1/health. Writing
// a PGlite file here instead would be worse than useless — the filesystem it
// lands on is thrown away, and the deployment would look seeded.
if (!url) {
  console.warn("[db] no DATABASE_URL (or NETLIFY_DATABASE_URL): skipping the seed. The deployed site will ask for one; nothing else is wrong with the build.");
  process.exit(0);
}

// Migrations are forced: STREAMLINE_SKIP_MIGRATIONS=1 belongs to the runtime,
// where racing every cold start is the thing to avoid. Here it would leave the
// database with no tables and a build that claimed success.
const conn = await connectDatabase({ url, migrate: true });
const t0 = Date.now();
try {
  const r = await seedDemo(conn.db, { force: process.argv.includes("--force") });
  console.info(`[db] ${conn.kind}: rosewood ${r.rosewood}, harbor ${r.harbor}, ${r.personas} personas (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} finally {
  await conn.close();
}
