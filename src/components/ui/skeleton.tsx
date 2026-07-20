import { cn } from "@/lib/utils";

function Skeleton({
  className,
  delay = 0,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/40 backdrop-blur-sm", className)}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    />
  );
}

function SkeletonCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn("rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm", className)} 
      {...props}
    >
      {children}
    </div>
  );
}

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={cn("h-3 w-full", i === lines - 1 && "w-[60%]")} 
          delay={i * 100}
        />
      ))}
    </div>
  );
}

/** skeleton component for the ui section. */
export { Skeleton, SkeletonCard, SkeletonText };
