import * as React from "react";
import { cn } from "./cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden="true" {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card", className)}>
      <div className="card-bd flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
  );
}
