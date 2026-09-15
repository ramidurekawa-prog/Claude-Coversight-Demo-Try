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

## Read next

- `docs/DEMO_PLAN.md` — the demo script, the eight surfaces, the data design, status.
- `docs/ARCHITECTURE.md` — how a dollar travels from the register to the proof packet.
- `docs/DEMO_TEST_CHECKLIST.md` — what is tested automatically and what to rehearse by hand.
- `CLAUDE.md` — the non-negotiable rules (integer cents, claim classes never mix, the mint, reserved words).
