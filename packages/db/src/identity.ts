/**
 * Pre-tenancy identity lookups — the single sanctioned exception to the
 * org-first rule: resolving a session answers "who is this?", and at that
 * moment the org is not yet known. Everything after goes through repositories.
 */
import { eq } from "drizzle-orm";
import type { StreamlineDb } from "./repositories";
import { memberships, skcAdmins, users } from "./schema";

export function createIdentityRepositories(db: StreamlineDb) {
  return {
    userByEmail: async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0],
    membershipForUser: async (userId: string) => (await db.select().from(memberships).where(eq(memberships.userId, userId)))[0],
    isSkcAdmin: async (userId: string) => (await db.select().from(skcAdmins).where(eq(skcAdmins.userId, userId))).length > 0,
  };
}
export type IdentityRepositories = ReturnType<typeof createIdentityRepositories>;
