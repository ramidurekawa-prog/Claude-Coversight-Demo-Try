import type { ReactNode } from "react";
import { AppShell } from "../../components/shell/app-shell";
import { requireSession } from "../../lib/server-api";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireSession();
  return <AppShell me={me}>{children}</AppShell>;
}
