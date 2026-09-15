import { createIdentityRepositories, createRepositories, type StreamlineDb } from "@streamline/db";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "./auth";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export type Role = "owner" | "gm" | "finance" | "admin";

/** 401 = no session; 403 = a session outside the requested scope. */
export interface AuthContext {
  user: AuthUser;
  orgId: string;
  role: Role;
  title: string;
  /** "all" for org-wide roles; the assigned location codes for a GM. */
  locationCodes: "all" | string[];
  isAdmin: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    authContext: AuthContext;
  }
}

export function makeRequireAuth({ auth, db }: { auth: Auth; db: StreamlineDb }) {
  const identity = createIdentityRepositories(db);
  const repos = createRepositories(db);
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return reply.code(401).send({ error: "unauthenticated", message: "Sign in required" });
    const user: AuthUser = { id: session.user.id, name: session.user.name, email: session.user.email };

    if (await identity.isSkcAdmin(user.id)) {
      // Platform staff act on a target org named per request (?org=<slug>), Rosewood by default;
      // every cross-org access lands on that org's audit trail.
      const slug = (req.query as { org?: string }).org ?? "rosewood";
      const org = await repos.orgs.findBySlug(slug);
      if (!org) return reply.code(404).send({ error: "not_found", message: `Unknown org: ${slug}` });
      await repos.audit.append(org.id, { on: org.asOf, actor: `${user.name} (Streamline admin)`, actorUserId: user.id, entityKind: "org", entityId: org.id, event: "admin_access", reason: `${req.method} ${req.url.split("?")[0]}` });
      req.authContext = { user, orgId: org.id, role: "admin", title: "Streamline (Coversight) operations", locationCodes: "all", isAdmin: true };
      return;
    }

    const membership = await identity.membershipForUser(user.id);
    if (!membership) return reply.code(403).send({ error: "forbidden", message: "No organisation membership" });
    const locationCodes = membership.role === "gm" ? await repos.memberships.scopes(membership.orgId, membership.id) : ("all" as const);
    req.authContext = { user, orgId: membership.orgId, role: membership.role, title: membership.title, locationCodes, isAdmin: false };
  };
}

export function requireRole(...roles: Role[]) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    if (!roles.includes(req.authContext.role)) return reply.code(403).send({ error: "forbidden", message: `${roles.join(" or ")} only` });
  };
}
