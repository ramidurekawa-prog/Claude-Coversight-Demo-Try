/**
 * The connection policy for a hosted database.
 *
 * Getting this wrong is invisible until it is a deployment that either refuses
 * to connect or connects in the clear, so the decision is a pure function and
 * the cases are pinned here.
 */
import { databaseUrl, migrationUrl, pgSslOption } from "../src/connect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const URL_KEYS = ["DATABASE_URL", "NETLIFY_DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"] as const;
const savedUrls: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of URL_KEYS) {
    savedUrls[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  delete process.env.STREAMLINE_PG_SSL_NO_VERIFY;
  for (const k of URL_KEYS) if (savedUrls[k] === undefined) delete process.env[k]; else process.env[k] = savedUrls[k];
});

describe("which connection string a host is offering", () => {
  it("reads the host's own variable, so a one-click database needs no second setting", () => {
    expect(databaseUrl()).toBeUndefined();
    process.env.NETLIFY_DATABASE_URL = "postgres://pooled";
    expect(databaseUrl()).toBe("postgres://pooled");
    // An explicit DATABASE_URL is the operator's decision and wins.
    process.env.DATABASE_URL = "postgres://mine";
    expect(databaseUrl()).toBe("postgres://mine");
  });

  it("migrates and seeds through the unpooled twin, because a pooler is the wrong door for DDL", () => {
    process.env.DATABASE_URL = "postgres://pooled";
    expect(migrationUrl()).toBe("postgres://pooled");
    process.env.NETLIFY_DATABASE_URL_UNPOOLED = "postgres://direct";
    expect(migrationUrl()).toBe("postgres://direct");
    expect(databaseUrl()).toBe("postgres://pooled");
  });
});

describe("pgSslOption", () => {
  it("leaves a local connection alone", () => {
    expect(pgSslOption("postgres://postgres@127.0.0.1:5433/streamline")).toEqual({});
    expect(pgSslOption("postgres://postgres@localhost/streamline")).toEqual({});
    // A unix socket: no hostname at all.
    expect(pgSslOption("postgres:///streamline?host=/var/run/postgresql")).toEqual({});
  });

  it("encrypts and verifies any remote host, with or without sslmode in the string", () => {
    const verified = { ssl: { rejectUnauthorized: true } };
    expect(pgSslOption("postgres://u:p@ep-cool-1.eu-central-1.aws.neon.tech/db?sslmode=require")).toEqual(verified);
    // The case the old sslmode=require test missed: a provider that requires
    // TLS but hands you a string that never says so.
    expect(pgSslOption("postgres://u:p@aws-0-eu-west-2.pooler.supabase.com:6543/postgres")).toEqual(verified);
    expect(pgSslOption("postgres://u:p@db.example.com/postgres?sslmode=verify-full")).toEqual(verified);
  });

  it("drops encryption only when the string says disable", () => {
    expect(pgSslOption("postgres://u:p@db.example.com/postgres?sslmode=disable")).toEqual({ ssl: false });
  });

  it("keeps encryption but skips verification only when asked explicitly", () => {
    const unverified = { ssl: { rejectUnauthorized: false } };
    expect(pgSslOption("postgres://u:p@db.example.com/postgres?sslmode=no-verify")).toEqual(unverified);
    process.env.STREAMLINE_PG_SSL_NO_VERIFY = "1";
    expect(pgSslOption("postgres://u:p@db.example.com/postgres")).toEqual(unverified);
  });

  it("does not encrypt a local connection that asks to prefer it", () => {
    expect(pgSslOption("postgres://postgres@localhost/streamline?sslmode=prefer")).toEqual({});
  });
});
