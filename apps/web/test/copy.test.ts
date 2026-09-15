import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Rule 4: the banned words never appear in product copy; the reserved words never label a non-realized figure. */
const BANNED = /\b(guaranteed|certain|proven)\b/i;
const RESERVED = /\b(banked)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe("product copy", () => {
  const files = [...walk(join(__dirname, "..", "app")), ...walk(join(__dirname, "..", "components"))];
  it("never says guaranteed, certain or proven", () => {
    const offenders = files.filter((f) => BANNED.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
  it("uses the reserved word 'banked' only beside realized-class copy", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (RESERVED.test(src)) expect(src, f).toMatch(/realized/i);
    }
  });
});
