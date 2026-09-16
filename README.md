# Streamline (by Coversight) — working demo

Closed-loop margin control for multi-location full-service restaurant groups. The demo tells one
story in 10–15 minutes: **DATA → FINDING → RECOMMENDATION → ACTION → EXECUTION → MEASUREMENT →
VERIFIED RESULT → ROI PROOF**, on a clearly labelled synthetic restaurant group whose every number is
computed by a deterministic engine — no LLM anywhere in the arithmetic path.

## Run it

```
pnpm install
pnpm demo          # builds the web app, starts the API on :3001 and the web app on :3000
```

Open http://localhost:3000 and sign in as **Rose Jorge** (owner) with the demo password shown on the
sign-in page. The business-date chip in the top bar opens the demo controls: advance the clock (the
synthetic register extends, the nightly job runs, windows close, the verification service decides) or
reset. No external services: the database is PGlite (in-process Postgres) under `packages/db/data`.

Other commands: `pnpm dev` (hot reload), `pnpm check` (typecheck + lint + tests + build),
`pnpm e2e` (Playwright, desktop + iPhone 13, runs the demo script end to end), `pnpm db:reset`.

## Deploy it (Netlify)

One site hosts both halves: the UI and the API, the latter inside a catch-all
route handler, because a serverless platform has no second process to proxy to.
`netlify.toml` is checked in.

1. **A Postgres database.** PGlite keeps its data in a file, which a serverless
   filesystem does not preserve, so a deployment needs a real server. Netlify DB
   (Neon) or any Neon/Supabase instance works. Take the **pooled** connection
   string.
2. **Migrate and seed it once, from your machine.** The fixture writes about
   250,000 rows, which is far more than a function invocation has time for:

   ```
   DATABASE_URL='<pooled connection string>' pnpm db:seed
   ```

3. **Set the environment variables** on the site: `DATABASE_URL`,
   `BETTER_AUTH_SECRET` (any long random string), `STREAMLINE_SKIP_MIGRATIONS=1`,
   `STREAMLINE_PG_POOL_MAX=1`. Hosting the API in-process is detected from the
   platform, so `STREAMLINE_EMBEDDED_API` is only needed to override it.
4. **Deploy.** Netlify's Next.js runtime supports Next 13.5 and later. If the
   build UI asks, the base directory is the repository root and the package
   directory is `apps/web`.

Two things to know before you show it to anyone. Advancing the demo clock
rebuilds a slice of the register and re-runs the engine — about 3 seconds
locally, more against a remote database — and Netlify's functions stop at 10
seconds on the free plan (26 on Pro), so advance in smaller steps there. And
"Reset the demo" rewrites the whole register, which will exceed any function
limit: reset by re-running `pnpm db:seed` against the database instead.

**If a deployed page shows a bare server error,** open `/api/v1/health` on the
site. It needs no session, holds no secrets, and diagnoses the deployment:

```json
{ "ok": true, "db": "unavailable", "mode": "embedded",
  "database": { "configured": true, "reachable": false, "migrated": false, "orgs": 0 },
  "diagnosis": "The database is not reachable. Check DATABASE_URL, and that it is the pooled connection string." }
```

`diagnosis` is present only when something is wrong, and names the remedy. The
four states a deployment gets stuck in are no `DATABASE_URL`, a database that
cannot be reached, one with no tables (migrations skipped and never run), and
one with tables but no rows (never seeded) — the last two are both fixed by
running `DATABASE_URL='<pooled url>' pnpm db:seed` once.

The function log carries the same reasons in full, prefixed `[streamline]`,
which is where to look if health itself does not answer: a production Next.js
build strips a server error's message on its way to the browser. On Netlify
that is Deploys → the deploy → Functions, or the site's Logs tab.

A remote database is connected over TLS with its certificate verified, whether
or not the connection string says `sslmode=require`. A provider using its own
certificate authority needs `sslmode=no-verify` in the URL, or
`STREAMLINE_PG_SSL_NO_VERIFY=1`; nothing drops verification on its own.

To verify the deployed shape locally, with no Netlify involved:

```
pnpm db:seed
pnpm --filter @streamline/web build
cd apps/web && STREAMLINE_EMBEDDED_API=1 pnpm start
```

## Read next

- `docs/DEMO_PLAN.md` — the demo script, the eight surfaces, the data design, status.
- `docs/ARCHITECTURE.md` — how a dollar travels from the register to the proof packet.
- `docs/DEMO_TEST_CHECKLIST.md` — what is tested automatically and what to rehearse by hand.
- `CLAUDE.md` — the non-negotiable rules (integer cents, claim classes never mix, the mint, reserved words).
