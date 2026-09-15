import { Skeleton, SkeletonCard } from "@streamline/ui";

export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="card" style={{ padding: 24 }}>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-12 w-72" style={{ marginTop: 12 }} />
        <Skeleton className="h-3 w-96" style={{ marginTop: 12 }} />
      </div>
      <div className="grid-4" style={{ marginTop: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
