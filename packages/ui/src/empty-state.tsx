import * as React from "react";
import { cn } from "./cn";

/** An empty list is a valid state. One line of what is missing, one of why, one action. */
export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("empty-state", className)} role="status">
      {icon && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
