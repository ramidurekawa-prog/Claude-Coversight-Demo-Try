import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { Auth } from "./auth";

/** The only better-auth endpoints that exist over HTTP. Sign-up answers 404: accounts come from the seed or an invite. */
const PUBLIC_AUTH_PATHS = new Set(["sign-in/email", "sign-out", "get-session"]);

export function mountAuth(app: FastifyInstance, auth: Auth) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/v1/auth/*",
    handler: async (request, reply) => {
      const subPath = request.url.replace(/^\/api\/v1\/auth\//, "").split("?")[0] ?? "";
      if (!PUBLIC_AUTH_PATHS.has(subPath)) return reply.code(404).send({ error: "not_found", message: "Unknown auth endpoint" });
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const init: RequestInit = { method: request.method, headers: fromNodeHeaders(request.headers) };
      if (request.method === "POST") init.body = JSON.stringify(request.body ?? {});
      const response = await auth.handler(new Request(url, init));
      reply.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        if (["set-cookie", "content-length", "content-encoding", "transfer-encoding"].includes(key)) continue;
        void reply.header(key, value);
      }
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length > 0) void reply.header("set-cookie", setCookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
