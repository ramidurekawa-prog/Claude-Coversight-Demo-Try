"use client";

/**
 * The boundary above the app shell.
 *
 * `(app)/error.tsx` wraps that segment's pages but not its own layout, and the
 * layout is where the session is loaded — so a deployment whose API cannot
 * answer `/api/v1/me` failed *above* that boundary and fell through to Next's
 * built-in page: "A server error occurred", on an unstyled white screen, with
 * no way to tell a missing connection string from an unseeded database. This
 * catches it inside the root layout and asks the deployment what is wrong.
 */
import { Button, EmptyState } from "@streamline/ui";
import { AlertTriangle } from "lucide-react";
import { failureCopy, useDeploymentDiagnosis } from "../components/failure";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const diagnosis = useDeploymentDiagnosis();
  const { title, description } = failureCopy(error, diagnosis);
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="glyph" aria-hidden="true">
            S
          </span>
          <span className="wm">
            Streamline
            <span className="by">by Coversight</span>
          </span>
        </div>
        <EmptyState icon={<AlertTriangle size={20} />} title={title} description={description} action={<Button variant="secondary" onClick={() => reset()}>Try again</Button>} />
      </div>
    </main>
  );
}
