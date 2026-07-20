import { Skeleton } from '@/components/ui/skeleton';

/** Loading Skeleton. */
export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[260px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}
