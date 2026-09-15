import { Button, EmptyState } from "@streamline/ui";
import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon={<SearchX size={20} />}
        title="No such record in this organisation"
        description="Either the id is wrong or it belongs to another tenant. Nothing crosses that line."
        action={
          <Link href="/">
            <Button variant="secondary">Back to Home</Button>
          </Link>
        }
      />
    </div>
  );
}
