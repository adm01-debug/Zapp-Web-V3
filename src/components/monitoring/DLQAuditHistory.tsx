import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollText, ChevronDown, ChevronRight, RefreshCw, RotateCw, Ban, ListChecks, PlayCircle, History } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { useDlqAuditLog, type DlqAuditEntry } from '@/features/admin';
import { cn } from '@/lib/utils';

const ACTION_META: Record<string, { label: string; tone: 'default' | 'success' | 'warning' | 'destructive'; icon: React.ComponentType<{ className?: string }> }> = {
  dlq_reprocess_trigger: { label: 'Disparou reprocesso',  tone: 'default',     icon: PlayCircle },
  dlq_reprocess_result:  { label: 'Resultado reprocesso', tone: 'success',     icon: ListChecks },
  dlq_retry_now:         { label: 'Retry manual',         tone: 'default',     icon: RotateCw },
  dlq_abandon:           { label: 'Abandono manual',      tone: 'destructive', icon: Ban },
  dlq_bulk_retry:        { label: 'Retry em massa',       tone: 'default',     icon: RotateCw },
  dlq_bulk_abandon:      { label: 'Abandono em massa',    tone: 'destructive', icon: Ban },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function actionBadge(action: string) {
  const meta = ACTION_META[action] ?? { label: action, tone: 'default' as const, icon: ScrollText };
  const Icon = meta.icon;
  const cls = {
    default:     'border-border text-foreground/80 bg-muted/40',
    success:     'border-primary/40 text-primary bg-primary/10',
    warning:     'border-warning/40 text-warning-foreground bg-warning/10',
    destructive: 'border-destructive/40 text-destructive bg-destructive/10',
  }[meta.tone];
  return (
    <Badge variant="outline" className={cn('text-[10px] gap-1', cls)}>
      <Icon className="w-3 h-3" />{meta.label}
    </Badge>
  );
}

function operatorLabel(entry: DlqAuditEntry) {
  if (entry.user_name) return entry.user_name;
  if (entry.user_email) return entry.user_email;
  if (entry.user_id) return entry.user_id.slice(0, 8) + '…';
  return 'Sistema';
}

function summary(entry: DlqAuditEntry): React.ReactNode {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'dlq_reprocess_result': {
      const processed = Number(d.processed ?? 0);
      const succeeded = Number(d.succeeded ?? 0);
      const failed    = Number(d.failed ?? 0);
      const abandoned = Number(d.abandoned ?? 0);
      if (processed === 0) return <span className="text-muted-foreground">Nenhum item pendente.</span>;
      return (
        <span className=" text-[11px]">
          {processed} processado(s) · <span className="text-primary">✓{succeeded}</span> · <span className="text-warning-foreground">↻{failed}</span> · <span className="text-destructive">⚠{abandoned}</span>
        </span>
      );
    }
    case 'dlq_reprocess_trigger':
      return <span className="text-muted-foreground">origem: {String(d.source ?? 'panel')}</span>;
    case 'dlq_retry_now':
    case 'dlq_abandon':
      return <span className=" text-[11px] text-muted-foreground">id: {entry.entity_id?.slice(0, 8)}…</span>;
    case 'dlq_bulk_retry':
    case 'dlq_bulk_abandon': {
      const count = Number(d.count ?? (Array.isArray(d.ids) ? d.ids.length : 0));
      return (
        <span className=" text-[11px]">
          {count} item(s){d.reason ? ` · motivo: ${String(d.reason)}` : ''}
        </span>
      );
    }
    default:
      return null;
  }
}

export function DLQAuditHistory() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: entries = [], isLoading, refetch, isFetching } = useDlqAuditLog({ limit: 30 });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />Auditoria da DLQ
            </CardTitle>
            <CardDescription>
              Quem reprocessou, quando, quais IDs foram afetados e o resultado de cada execução.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            aria-label="Atualizar histórico"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', (isLoading || isFetching) && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {entries.length === 0 ? (
          <GenericEmptyState
            icon={ScrollText}
            title="Sem operações registradas"
            description="Quando alguém disparar um retry, abandono ou reprocesso, o histórico aparece aqui."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border overflow-hidden">
            {entries.map(entry => {
              const isOpen = expandedId === entry.id;
              const detailIds = entry.details?.ids;
              const ids = Array.isArray(detailIds) ? (detailIds as string[]) : [];
              const hasDetails = ids.length > 0 || (entry.details && Object.keys(entry.details).length > 0);
              return (
                <li key={entry.id} className="bg-card">
                  <Collapsible open={isOpen} onOpenChange={(o) => setExpandedId(o ? entry.id : null)}>
                    <div className="flex items-start gap-3 p-3">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 mt-0.5 shrink-0"
                          disabled={!hasDetails}
                          aria-label={isOpen ? 'Recolher detalhes' : 'Expandir detalhes'}
                        >
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {actionBadge(entry.action)}
                          <span className="text-xs font-medium truncate">{operatorLabel(entry)}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {fmtDateTime(entry.created_at)}
                          </span>
                        </div>
                        <div className="text-xs">{summary(entry)}</div>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pl-12 space-y-2">
                        {ids.length > 0 && (
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                              IDs afetados ({ids.length})
                            </p>
                            <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
                              {ids.map(id => (
                                <code key={id} className="text-[10px]  bg-muted/50 border rounded px-1.5 py-0.5">
                                  {id.slice(0, 8)}…
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Payload</p>
                          <pre className="text-[10px]  bg-background border rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                            {JSON.stringify(entry.details ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
