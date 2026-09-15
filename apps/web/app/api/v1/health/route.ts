import { HealthResponse } from "@streamline/contracts";

export function GET() {
  const body = HealthResponse.parse({ ok: true, version: "0.1.0" });
  return Response.json(body);
}
