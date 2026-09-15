/**
 * Seeded randomness — the only randomness in the platform, and it is keyed.
 * Every row is a pure function of (seed, its own key), so extending the
 * register through a later date never changes an earlier row.
 */

/** FNV-1a 32-bit hash, for turning stable labels into PRNG seeds. */
export function seedFromLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  u(): number;
  norm(mean?: number, sd?: number): number;
  int(a: number, b: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function rngFor(...keyParts: Array<string | number>): Rng {
  const r = mulberry32(seedFromLabel(keyParts.join("|")));
  return {
    u: () => r(),
    norm: (mean = 0, sd = 1) => {
      let u = 0;
      let v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)] as never,
  };
}
