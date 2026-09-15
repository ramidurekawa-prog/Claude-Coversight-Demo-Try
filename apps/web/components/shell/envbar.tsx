"use client";

import type { MeResponse } from "@streamline/contracts";
import * as React from "react";
import { AboutDrawer } from "./about-drawer";

/** Rule 10: synthetic data is labelled as synthetic, on every screen. */
export function EnvBar({ me }: { me: MeResponse }) {
  const [about, setAbout] = React.useState(false);
  if (!me.org.synthetic) return null;
  return (
    <div className="envbar" role="note">
      <span className="dot" aria-hidden="true" />
      <span>
        <strong>Synthetic data.</strong> {me.org.fixtureLabel ?? "Sample restaurant group · deterministic demo data"}
        {me.org.fixtureVersion ? ` · fixture v${me.org.fixtureVersion}` : ""}
      </span>
      <button type="button" onClick={() => setAbout(true)}>
        What is simulated?
      </button>
      {about && <AboutDrawer me={me} onClose={() => setAbout(false)} />}
    </div>
  );
}
