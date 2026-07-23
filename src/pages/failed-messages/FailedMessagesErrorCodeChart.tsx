import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type ErrorCodeAggregate } from '@/features/admin/hooks/monitoring/useFailedMessages';

/** Failed Messages Error Code Chart. */
export function FailedMessagesErrorCodeChart({ stats, filter, onFilterChange }: { stats: ErrorCodeAggregate[]; filter: string; onFilterChange: (v: string) => void }) {
  if (stats.length === 0) return null;
  const maxReasonCount = stats[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Top motivos de falha (error_code)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {stats.map((r) => {
          const pct = Math.round((r.count / maxReasonCount) * 100);
          const isActive = filter === r.code;
          return (
            <button
              key={r.code}
              type="button"
              onClick={() => onFilterChange(isActive ? 'all' : r.code)}
              className={cn(
                'w-full flex items-center gap-3 text-left rounded-md p-1.5 transition-colors',
                isActive ? 'bg-primary/10' : 'hover:bg-muted/50',
              )}
            >
              <span className="text-xs  w-32 truncate shrink-0">{r.code}</span>
              <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    isActive ? 'bg-primary' : 'bg-warning/70',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs tabular-nums w-10 text-right shrink-0">{r.count}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
