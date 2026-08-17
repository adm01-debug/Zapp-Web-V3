import { useFollowupPending } from '@/hooks/followup/useFollowupPending';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CheckCircle2, Loader2, AlertTriangle, ListTodo } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * FollowUpPendingPanel — G8 (2026-08-17): follow-ups pendentes e vencidos.
 *
 * Lista `zapp.evolution_followups` com status IN ('pending','scheduled') e
 * scheduled_at <= now — exatamente o conjunto que o motor (cron
 * `evolution-followup`) reclama. O painel dá visibilidade ao que está
 * atrasado e permite "Concluir" (marca 'completed' via
 * `zapp.rpc_complete_followup`, tirando a linha do claim do motor).
 */
export function FollowUpPendingPanel() {
  const { followups, contactNames, isLoading, error, completeMutation } =
    useFollowupPending();

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (error) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-4">
          <p className="text-center text-sm text-muted-foreground">
            Follow-ups pendentes indisponíveis no momento (
            {error instanceof Error ? error.message : 'erro desconhecido'})
          </p>
        </CardContent>
      </Card>
    );
  }

  if (followups.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-0">
          <GenericEmptyState
            icon={ListTodo}
            title="Nenhum follow-up pendente"
            description="Follow-ups vencidos ou aguardando o motor aparecem aqui"
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
          <Clock className="w-5 h-5 text-primary" />
          Follow-ups Pendentes
          <Badge variant="outline" className="ml-1">
            {followups.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border/50">
            {followups.map((fu) => {
              const overdue = new Date(fu.scheduled_at).getTime() < Date.now();
              const completing = completeMutation.isPending &&
                completeMutation.variables === fu.id;
              return (
                <div
                  key={fu.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    {overdue ? (
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">
                        {contactNames[fu.contact_id ?? ''] ?? 'Contato'}
                      </span>
                      {overdue && (
                        <Badge variant="outline" className="text-[10px] bg-warning/20 text-warning border-warning/30">
                          Atrasado
                        </Badge>
                      )}
                      {fu.followup_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {fu.followup_type}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span title={new Date(fu.scheduled_at).toISOString()}>
                        {format(new Date(fu.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                        {' '}({formatDistanceToNow(new Date(fu.scheduled_at), { locale: ptBR, addSuffix: true })})
                      </span>
                      {fu.instance_name && <span>• {fu.instance_name}</span>}
                    </div>
                    {fu.custom_message && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {fu.custom_message}
                      </p>
                    )}
                  </div>
                  <Button
                    aria-label={`Concluir follow-up de ${contactNames[fu.contact_id ?? ''] ?? 'contato'}`}
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={completing}
                    onClick={() => completeMutation.mutate(fu.id)}
                  >
                    {completing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Concluir
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
