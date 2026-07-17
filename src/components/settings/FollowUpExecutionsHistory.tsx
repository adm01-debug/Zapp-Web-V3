import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CheckCircle2, XCircle, Loader2, History } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: { label: 'Ativo', color: 'bg-info/20 text-info border-info/30', icon: Loader2 },
  completed: {
    label: 'Concluído',
    color: 'bg-success/20 text-success border-success/30',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-destructive/20 text-destructive border-destructive/30',
    icon: XCircle,
  },
  paused: { label: 'Pausado', color: 'bg-warning/20 text-warning border-warning/30', icon: Clock },
};

export function FollowUpExecutionsHistory() {
  const { data: executions = [], isLoading } = useQuery({
    queryKey: queryKeys.followupSequences.executionsRoot(),
    queryFn: async () => {
      type ExecutionRow = {
        id: string;
        status: string;
        current_step: number;
        created_at: string;
        sequence: { name: string } | null;
        contact: { name: string | null; phone: string | null } | null;
      };
      const { data, error } = await safeClient.from<ExecutionRow>('followup_executions', (q) =>
        q
          .select('*, sequence:followup_sequences(name), contact:contacts(name, phone)')
          .order('created_at', { ascending: false })
          .limit(100)
      );
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (executions.length === 0) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="py-0">
          <GenericEmptyState
            icon={History}
            title="Sem execuções"
            description="Nenhuma execução de follow-up registrada"
            className="py-8"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5 text-primary" />
          Histórico de Execuções
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border/50">
            {executions.map((exec) => {
              const cfg = STATUS_MAP[exec.status] || STATUS_MAP.active;
              const Icon = cfg.icon;

              return (
                <div
                  key={exec.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {exec.sequence?.name || 'Sequência removida'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{exec.contact?.name || exec.contact?.phone || '—'}</span>
                      <span>•</span>
                      <span>Etapa {exec.current_step}</span>
                      <span>•</span>
                      <span>
                        {format(new Date(exec.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
