import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ContactViewMode } from './ContactViewSwitcher';

const GRID_COLUMNS_CLASS: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
};

interface ContactsSkeletonProps {
  viewMode: ContactViewMode;
  gridColumns: number;
}

/** Contacts Skeleton component for the contacts section. */
export function ContactsSkeleton({ viewMode, gridColumns }: ContactsSkeletonProps) {
  if (viewMode === 'kanban') {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 rounded-xl border border-border/30 p-3 space-y-3">
            <div className="h-5 w-20 rounded bg-muted animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (col * 3 + i) * 0.04 }}
                className="rounded-lg border border-border/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-3 w-32 rounded bg-muted/50 animate-pulse" />
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'analytics') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-border/30 p-5 space-y-4">
            <div className="h-5 w-28 rounded bg-muted animate-pulse" />
            <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (viewMode === 'map') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="rounded-xl border border-border/30 h-[500px] bg-muted/20 animate-pulse flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-muted/50 animate-pulse mx-auto" />
          <div className="h-4 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
        </div>
      </motion.div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className={cn("grid gap-4", GRID_COLUMNS_CLASS[gridColumns] || GRID_COLUMNS_CLASS[4])}>
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }}
            className="rounded-2xl border border-border/30 p-5 space-y-4">
            <div className="h-1 w-full rounded bg-muted/60 animate-pulse" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-3 w-16 rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
            <div className="h-12 rounded-xl bg-muted/40 animate-pulse" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
            className="flex items-center gap-4 px-4 py-3 rounded-xl border border-border/30">
            <div className="w-4 h-4 rounded bg-muted animate-pulse" />
            <div className="w-11 h-11 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted/50 animate-pulse" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  // Table skeleton
  return (
    <Card className="overflow-hidden border-border/30 shadow-none">
      <div className="bg-muted/20 h-10 border-b border-border/20 px-4 flex items-center gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={cn("h-3 rounded bg-muted/60 animate-pulse", i === 0 ? "w-10" : "flex-1")} />
        ))}
      </div>
      <CardContent className="p-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-4 p-4 border-b border-border/10 last:border-0"
          >
            <div className="w-5 h-5 rounded bg-muted animate-pulse shrink-0" />
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
            <div className="h-4 w-24 rounded bg-muted/40 animate-pulse flex-1 hidden md:block" />
            <div className="h-4 w-32 rounded bg-muted/40 animate-pulse flex-1 hidden lg:block" />
            <div className="h-4 w-28 rounded bg-muted/40 animate-pulse flex-1 hidden xl:block" />
            <div className="w-10 h-8 rounded bg-muted/30 animate-pulse shrink-0" />
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
