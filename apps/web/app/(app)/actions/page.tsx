import { ActionsResponse } from "@streamline/contracts";
import type { Metadata } from "next";
import { requireSession, scopeParam, serverApi } from "../../../lib/server-api";
import { ActionsBoard } from "./actions-board";

export const metadata: Metadata = { title: "Actions" };
export const dynamic = "force-dynamic";

export default async function ActionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me] = await Promise.all([searchParams, requireSession()]);
  const scope = scopeParam(sp);
  const data = await serverApi(ActionsResponse, `/api/v1/actions${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
  const rooms = Object.fromEntries(me.locations.map((l) => [l.code, l.short]));
  return (
    <div className="page">
      <ActionsBoard asOf={data.asOf} actions={data.actions} scope={scope} rooms={rooms} role={me.persona.role} />
    </div>
  );
}
