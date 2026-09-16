import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The UI never reaches the database. Hosting the API in-process (the serverless
 * deployment) is allowed in exactly two files, which are the API's host rather
 * than part of the UI.
 */
const HOSTS = ["lib/embedded-api.ts", "app/api/[...path]/route.ts"];
const FORBIDDEN = /from "@streamline\/(db|fixture|api)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("web layering", () => {
  it("imports the database only from the files that host the API", () => {
    const root = join(__dirname, "..");
    const offenders = [...walk(join(root, "app")), ...walk(join(root, "lib")), ...walk(join(root, "components"))]
      .filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f))
      .filter((f) => !HOSTS.includes(f.split("\\").join("/")));
    expect(offenders).toEqual([]);
  });
});
