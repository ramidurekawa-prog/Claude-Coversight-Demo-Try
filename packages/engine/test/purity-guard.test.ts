import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The engine is pure: no clock, no randomness, no I/O, no imports of the
// database, the fixture or the web. ESLint enforces it; this test makes it
// mechanical by scanning the real source so the two can never drift apart.
const SRC = join(import.meta.dirname, "..", "src");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bnew Date\b/, "new Date()"],
  [/\bDate\.now\b/, "Date.now()"],
  [/\bMath\.random\b/, "Math.random()"],
  [/\bprocess\.\w+/, "process"],
  [/\bfetch\(/, "fetch"],
  [/\bsetTimeout\b|\bsetInterval\b/, "timers"],
  [/from\s+["'](node:|fs|path|crypto|http|https)/, "node built-ins"],
  [/from\s+["']@streamline\/(db|fixture|contracts|web|ui)/, "downstream packages"],
  [/from\s+["'](react|next|drizzle-orm|pg|better-sqlite3)/, "framework or database"],
];

describe("engine purity guard", () => {
  it("the real engine source contains no clock, randomness, I/O or downstream imports", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const [re, what] of FORBIDDEN) if (re.test(text)) offenders.push(`${file.replace(SRC, "src")}: ${what}`);
    }
    expect(offenders).toEqual([]);
  });
});
