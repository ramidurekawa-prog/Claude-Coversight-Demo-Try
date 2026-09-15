"use client";

import type { MeResponse } from "@streamline/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { withScope } from "../../lib/scope";

/** All rooms | Oakland | Berkeley | Alameda — the URL carries the choice; a GM sees only their rooms. */
export function ScopeSwitcher({ me, scope }: { me: MeResponse; scope: string | undefined }) {
  const pathname = usePathname();
  const allowed = me.scope === "all" ? me.locations : me.locations.filter((l) => (me.scope as string[]).includes(l.code));
  if (allowed.length <= 1 && me.scope !== "all") {
    return <span className="clockchip" style={{ cursor: "default" }}>{allowed[0]?.short ?? "—"}</span>;
  }
  const active = scope ?? "all";
  return (
    <nav className="seg" aria-label="Scope">
      {me.scope === "all" && (
        <Link href={withScope(pathname, undefined)} className={active === "all" ? "on" : ""} aria-current={active === "all" ? "true" : undefined}>
          All rooms
        </Link>
      )}
      {allowed.map((l) => (
        <Link key={l.code} href={withScope(pathname, l.code)} className={active === l.code ? "on" : ""} aria-current={active === l.code ? "true" : undefined}>
          {l.short}
        </Link>
      ))}
    </nav>
  );
}
