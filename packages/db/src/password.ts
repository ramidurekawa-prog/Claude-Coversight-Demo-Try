/**
 * Password hashing for the demo personas.
 *
 * scrypt from Node's own crypto, at OWASP's recommended parameters for scrypt
 * (N = 2^17, r = 8, p = 1).
 *
 * Deliberately NOT argon2id, which OWASP prefers: argon2 ships as a native
 * binary whose platform loader cannot be bundled into a serverless function,
 * and this demo has to deploy to one. Nothing has ever stored an argon2 hash
 * here, so there is no migration path to keep; a real deployment that wants
 * argon2id changes both functions below together and accepts a Node host.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

/** OWASP: scrypt with N ≥ 2^17, r = 8, p = 1. maxmem must clear 128 × N × r. */
const OWASP_SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
/** Tests and the seed churn through many hashes and are not verifying KDF strength. */
const FAST_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const KEYLEN = 64;
const profile = () => (process.env.NODE_ENV === "test" || process.env.STREAMLINE_FAST_HASH === "1" ? FAST_SCRYPT : OWASP_SCRYPT);

export async function hashPassword(password: string): Promise<string> {
  const p = profile();
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, p);
  return `scrypt$${p.N}$${p.r}$${p.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword({ password, hash: stored }: { password: string; hash: string }): Promise<boolean> {
  const [scheme, N, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !N || !r || !p || !saltB64 || !keyB64) return false;
  // The cost parameters come from the stored hash, so a hash made under either
  // profile verifies under the other.
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 192 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
