import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type RootCauseAggregate } from '@/features/admin/hooks/monitoring/useFailedMessages';

const ROOT_CAUSE_TONE_CLASS: Record<'warning' | 'destructive' | 'info' | 'muted', string> = {
  warning: 'bg-warning/15 text-warning-foreground border-warning/40',
  destructive: 'bg-destructive/15 text-destructive border-destructive/40',
  info: 'bg-primary/15 text-primary border-primary/40',
  muted: 'bg-muted text-muted-foreground border-border',
};

/** Failed Messages Root Cause Chart. */
export function FailedMessagesRootCauseChart({ stats, filter, onFilterChange }: { stats: RootCauseAggregate[]; filter: string; onFilterChange: (v: string) => void }) {
  if (stats.length === 0) return null;
  const maxRootCauseCount = stats[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Causa raiz
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => onFilterChange('all')}
              className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Limpar filtro
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {stats.map((r) => {
          const pct = Math.round((r.count / maxRootCauseCount) * 100);
          const isActive = filter === r.cause;
          return (
            <button
              key={r.cause}
              type="button"
              onClick={() => onFilterChange(isActive ? 'all' : r.cause)}
              className={cn(
                'w-full flex items-center gap-3 text-left rounded-md p-1.5 transition-colors',
                isActive ? 'bg-primary/10' : 'hover:bg-muted/50',
              )}
              title={r.meta.hint}
            >
              <Badge
                variant="outline"
                className={cn('w-36 justify-center shrink-0 text-[11px]', ROOT_CAUSE_TONE_CLASS[r.meta.tone as keyof typeof ROOT_CAUSE_TONE_CLASS])}
              >
                {r.meta.label}
              </Badge>
              <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    isActive ? 'bg-primary' : r.meta.tone === 'destructive' ? 'bg-destructive/70' : 'bg-warning/70',
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
