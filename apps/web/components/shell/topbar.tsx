"use client";

import type { MeResponse } from "@streamline/contracts";
import { CalendarClock, Menu } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import { navForPathname, titleForPathname } from "../../lib/nav";
import { formatDateYear } from "../../lib/format";
import { DemoControls } from "./demo-controls";
import { ScopeSwitcher } from "./scope-switcher";

/**
 * Title + the screen's question, the scope switcher, the business date (the
 * org's demo clock — never the wall clock, so the date agrees with every figure
 * on the page) and the demo controls.
 */
export function TopBar({ me }: { me: MeResponse }) {
  const pathname = usePathname();
  const nav = navForPathname(pathname);
  const [controls, setControls] = React.useState(false);
  const sp = useSearchParams();
  const scope = sp.get("scope") ?? undefined;
  return (
    <header className="topbar">
      <button type="button" className="iconbtn burger" aria-label="Open navigation" onClick={() => document.body.classList.add("nav-open")}>
        <Menu size={18} />
      </button>
      <div className="col" style={{ lineHeight: 1.25, minWidth: 0 }}>
        <h1>{titleForPathname(pathname)}</h1>
        {nav && <span className="sub">{nav.question}</span>}
      </div>
      <div className="spacer" />
      <ScopeSwitcher me={me} scope={scope} />
      <button type="button" className="clockchip" onClick={() => setControls(true)} title="Business date — the demo clock. Open the demo controls.">
        <span className="dot" aria-hidden="true" />
        <CalendarClock size={15} />
        {formatDateYear(me.org.asOf)}
      </button>
      {controls && <DemoControls me={me} onClose={() => setControls(false)} />}
    </header>
  );
}
