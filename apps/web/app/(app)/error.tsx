"use client";

import { Button, EmptyState } from "@streamline/ui";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const unreachable = /api_unreachable|ECONNREFUSED|fetch failed/i.test(error.message);
  return (
    <div className="page">
      <EmptyState
        icon={<AlertTriangle size={20} />}
        title={unreachable ? "The API is not reachable" : "This screen could not be loaded"}
        description={unreachable ? "Start the API with `pnpm dev` (it listens on port 3001), then try again. Nothing on this screen is computed in the browser, so without the API there is nothing to show." : error.message}
        action={
          <Button variant="secondary" onClick={() => reset()}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
