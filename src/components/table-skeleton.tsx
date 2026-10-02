import { Skeleton } from "@/components/ui/skeleton";

/** Shared table-loading fallback used by list pages. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="ml-auto h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-lg border p-4">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
