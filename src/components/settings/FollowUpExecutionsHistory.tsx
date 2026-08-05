import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CheckCircle2, XCircle, Loader2, History, Send, Ban } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * WHATSAPP-10 (FIX 2026-08-04): histórico agora lê o estado REAL do motor —
 * `zapp.evolution_followups` (instâncias agendadas/processadas pelo edge
 * `evolution-followup` via cron). Antes lia `zapp.followup_executions`, que
 * não tem produtor no repo → histórico sempre vazio.
 */
const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: 'Agendado', color: 'bg-info/20 text-info border-info/30', icon: Clock },
  processing: { label: 'Processando', color: 'bg-warning/20 text-warning border-warning/30', icon: Loader2 },
  queued: { label: 'Na fila', color: 'bg-info/20 text-info border-info/30', icon: Send },
  sent: { label: 'Enviado', color: 'bg-success/20 text-success border-success/30', icon: CheckCircle2 },
  completed: { label: 'Concluído', color: 'bg-success/20 text-success border-success/30', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-destructive/20 text-destructive border-destructive/30', icon: Ban },
  failed: { label: 'Falhou', color: 'bg-destructive/20 text-destructive border-destructive/30', icon: XCircle },
};

interface EngineFollowupRow {
  id: string | null;
  status: string | null;
  followup_type: string | null;
  scheduled_at: string | null;
  created_at: string | null;
  custom_message: string | null;
  template_id: string | null;
  error_message: string | null;
  contact_id: string | null;
}

/** Follow Up Executions History component for the settings section. */
export function FollowUpExecutionsHistory() {
  const { data: executions = [], isLoading, error } = useQuery({
    queryKey: queryKeys.followupSequences.executionsRoot(),
    queryFn: async () => {
      type Row = EngineFollowupRow;
      const { data, error } = await safeClient.from<Row>(
        'evolution_followups',
        (q) =>
          q
            .select(
              'id, status, followup_type, scheduled_at, created_at, custom_message, template_id, error_message, contact_id'
            )
            .order('created_at', { ascending: false })
            .limit(100)
      );
      if (error) throw error;
      return (data ?? []) as EngineFollowupRow[];
    },
  });

  // Nomes de contato resolvidos em batch (embed não tipado — busca separada).
  const { data: contactNames = {} } = useQuery({
    queryKey: [...queryKeys.followupSequences.executionsRoot(), 'contacts'] as const,
    enabled: executions.length > 0,
    queryFn: async () => {
      const ids = Array.from(
        new Set(executions.map((e) => e.contact_id).filter((v): v is string => !!v))
      );
      if (ids.length === 0) return {} as Record<string, string>;
      const { data, error } = await safeClient.from<{
        id: string | null;
        full_name: string | null;
        phone_number: string | null;
      }>('evolution_contacts', (q) =>
        q.select('id, full_name, phone_number').in('id', ids)
      );
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of data ?? []) {
        if (c.id) map[c.id] = c.full_name || c.phone_number || c.id;
      }
      return map;
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (error) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-4">
          <p className="text-center text-sm text-muted-foreground">
            Histórico indisponível no momento (
            {error instanceof Error ? error.message : 'erro desconhecido'})
          </p>
        </CardContent>
      </Card>
    );
  }

  if (executions.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-0">
          <GenericEmptyState
            icon={History}
            title="Sem execuções"
            description="Nenhum follow-up agendado/processado pelo motor ainda"
            className="py-8"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Execuções do Motor de Follow-up
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border/50">
            {executions.map((exec) => {
              const cfg = STATUS_MAP[exec.status ?? ''] || STATUS_MAP.pending;
              const Icon = cfg.icon;
              const when = exec.scheduled_at ?? exec.created_at;
              return (
                <div
                  key={exec.id ?? `${exec.contact_id}_${exec.scheduled_at}`}
                  title={exec.error_message ?? undefined}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">
                        {contactNames[exec.contact_id ?? ''] ?? 'Contato'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                      {exec.followup_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {exec.followup_type}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{exec.custom_message ? 'Mensagem personalizada' : exec.template_id ? 'Template' : '—'}</span>
                      <span>•</span>
                      <span>{when ? format(new Date(when), "dd/MM HH:mm", { locale: ptBR }) : '—'}</span>
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
