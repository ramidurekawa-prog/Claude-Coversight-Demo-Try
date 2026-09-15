import { hash, verify, type Options } from "@node-rs/argon2";

/** argon2id, OWASP first-recommended parameters (64 MiB, t=3, p=4). */
const OWASP_ARGON2ID: Options = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32, algorithm: 2 };
/** Tests and the demo seed churn through many hashes; verify() reads the parameters from the hash, so the two profiles interoperate. */
const FAST_ARGON2ID: Options = { memoryCost: 4096, timeCost: 1, parallelism: 1, outputLen: 32, algorithm: 2 };

const PROFILE = process.env.NODE_ENV === "test" || process.env.STREAMLINE_FAST_HASH === "1" ? FAST_ARGON2ID : OWASP_ARGON2ID;

export function hashPassword(password: string): Promise<string> {
  return hash(password, PROFILE);
}
export function verifyPassword({ password, hash: stored }: { password: string; hash: string }): Promise<boolean> {
  return verify(stored, password, PROFILE);
}
