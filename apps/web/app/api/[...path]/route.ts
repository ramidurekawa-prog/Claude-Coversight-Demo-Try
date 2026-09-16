import { embeddedApi, isEmbedded } from "../../../lib/embedded-api";
import { proxyToApi } from "../../../lib/api-proxy";

export const dynamic = "force-dynamic";

/** Embedded when there is no second process to proxy to (serverless); proxied in development. */
const handle = (request: Request): Promise<Response> => (isEmbedded() ? embeddedApi(request) : proxyToApi(request));

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const PUT = handle;
export const PATCH = handle;
