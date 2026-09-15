import { proxyToApi } from "../../../lib/api-proxy";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => proxyToApi(request);
export const POST = (request: Request) => proxyToApi(request);
export const DELETE = (request: Request) => proxyToApi(request);
