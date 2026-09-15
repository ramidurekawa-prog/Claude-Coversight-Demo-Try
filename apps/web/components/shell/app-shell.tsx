import type { MeResponse } from "@streamline/contracts";
import type { ReactNode } from "react";
import { EnvBar } from "./envbar";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

/** The persistent frame: sidebar + sticky top bar + environment bar + scrolling content. */
export function AppShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar me={me} />
      <div className="content">
        <TopBar me={me} />
        <EnvBar me={me} />
        <main className="scroll" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
