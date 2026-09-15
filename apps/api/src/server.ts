import { connectDatabase, seedDemo } from "@streamline/db";
import { buildApp } from "./app";

const conn = await connectDatabase();
// STREAMLINE_RESET_ON_START=1 re-seeds every org from the fixture (e2e runs and demo rehearsals).
const seeded = await seedDemo(conn.db, { force: process.env.STREAMLINE_RESET_ON_START === "1" });
const app = buildApp({
  logger: true,
  db: conn.db,
  dbPing: conn.ping,
  authConfig: {
    secret: process.env.BETTER_AUTH_SECRET ?? "insecure-dev-only-secret-change-me",
    baseURL: process.env.API_BASE_URL ?? "http://localhost:3001",
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  },
});
app.log.info({ db: conn.kind, seeded }, "database ready");
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
