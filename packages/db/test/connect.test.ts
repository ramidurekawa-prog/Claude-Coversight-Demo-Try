/**
 * The connection policy for a hosted database.
 *
 * Getting this wrong is invisible until it is a deployment that either refuses
 * to connect or connects in the clear, so the decision is a pure function and
 * the cases are pinned here.
 */
import { pgSslOption } from "../src/connect";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  delete process.env.STREAMLINE_PG_SSL_NO_VERIFY;
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
