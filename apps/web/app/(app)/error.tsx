"use client";

import { Button, EmptyState } from "@streamline/ui";
import { AlertTriangle } from "lucide-react";
import { failureCopy, useDeploymentDiagnosis } from "../../components/failure";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const diagnosis = useDeploymentDiagnosis();
  const { title, description } = failureCopy(error, diagnosis);
  return (
    <div className="page">
      <EmptyState
        icon={<AlertTriangle size={20} />}
        title={title}
        description={description}
        action={
          <Button variant="secondary" onClick={() => reset()}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
