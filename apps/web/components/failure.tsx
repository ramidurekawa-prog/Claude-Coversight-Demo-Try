"use client";

/**
 * What a broken deployment shows.
 *
 * A production Next.js build sends the error boundary a digest and nothing
 * else, so the page cannot say why it failed from the error alone. It can ask:
 * /api/v1/health needs no session, is served even when the database is not
 * reachable, and carries a `diagnosis` sentence naming the remedy. So the page
 * that failed asks it, and shows the answer — which is the difference between
 * "a server error occurred" and "DATABASE_URL is not set".
 */
import { apiFetch, HealthResponse } from "@streamline/contracts";
import * as React from "react";

export interface DeploymentDiagnosis {
  /** Absent while the check is in flight, so the page does not flash a wrong reason. */
  checked: boolean;
  /** The remedy, when the deployment knows one. */
  diagnosis?: string;
  /** True when the API itself could not be asked: the whole app is down, not just its data. */
  unreachable: boolean;
}

/** Ask the deployment what is wrong with it. Never throws: a failure to ask is itself an answer. */
export async function fetchDiagnosis(): Promise<DeploymentDiagnosis> {
  try {
    const h = await apiFetch(HealthResponse, "/api/v1/health", { cache: "no-store" });
    return { checked: true, unreachable: false, ...(h.diagnosis ? { diagnosis: h.diagnosis } : {}) };
  } catch {
    return { checked: true, unreachable: true };
  }
}

export function useDeploymentDiagnosis(): DeploymentDiagnosis {
  const [state, setState] = React.useState<DeploymentDiagnosis>({ checked: false, unreachable: false });
  React.useEffect(() => {
    let live = true;
    void fetchDiagnosis().then((d) => {
      if (live) setState(d);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** The sentence pair to show for a failure, once the deployment has been asked about itself. */
export function failureCopy(error: Error, d: DeploymentDiagnosis): { title: string; description: string } {
  if (d.diagnosis) return { title: "This deployment is not finished being set up", description: d.diagnosis };
  const unreachable = d.unreachable || /api_unreachable|ECONNREFUSED|fetch failed/i.test(error.message);
  if (unreachable) return { title: "The API is not reachable", description: "Start the API with `pnpm dev` (it listens on port 3001), then try again. Nothing on this screen is computed in the browser, so without the API there is nothing to show." };
  return { title: "This screen could not be loaded", description: `${error.message} A deployed build redacts the reason here; the server log carries it in full, prefixed [streamline].` };
}
