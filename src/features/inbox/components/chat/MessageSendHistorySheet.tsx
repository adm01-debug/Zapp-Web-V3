/**
 * Side sheet com o histórico completo de envio de uma mensagem.
 *
 * Aberto pelo menu de contexto da bolha — útil para depurar com o time
 * comercial sem precisar ir no Supabase Studio. Mostra:
 *   1. Resumo da mensagem (ID, status, timestamps, conexão, retry persistido)
 *   2. Métricas agregadas (tentativas, duração total, status final)
 *   3. Linha do tempo de tentativas (status HTTP + motivo por tentativa)
 *   4. Audit log + payload bruto (collapsible)
 *
 * Ação única: copiar resumo formatado para clipboard.
 */
import { useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Copy,
  ChevronDown,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Hash,
  Wifi,
  RefreshCw,
} from 'lucide-react';
import { format, formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useMessageSendHistory } from '@/features/inbox';
import { formatFailureReason } from '@/features/inbox';
import type { Message } from '@/types/chat';

interface Props {
  message: Pick<
    Message,
    | 'id'
    | 'content'
    | 'status'
    | 'timestamp'
    | 'type'
    | 'external_id'
    | 'retry_attempt'
    | 'retry_total'
  > & {
    status_updated_at?: string | null;
    whatsapp_connection_id?: string | null;
    updated_at?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  sending: { label: 'Enviando', className: 'bg-muted text-muted-foreground' },
  retrying: {
    label: 'Tentando reenviar',
    className: 'bg-warning/15 text-warning border border-warning/30',
  },
  sent: { label: 'Enviado', className: 'bg-info/15 text-info border border-info/30' },
  delivered: {
    label: 'Entregue',
    className: 'bg-success/15 text-success border border-success/30',
  },
  read: { label: 'Visualizada', className: 'bg-success/20 text-success border border-success/40' },
  failed: {
    label: 'Falhou',
    className: 'bg-destructive/15 text-destructive border border-destructive/30',
  },
  failed_auth: {
    label: 'Falha de autenticação',
    className: 'bg-destructive/15 text-destructive border border-destructive/30',
  },
  failed_retries: {
    label: 'Falhou após retries',
    className: 'bg-destructive/15 text-destructive border border-destructive/30',
  },
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(new Date(d), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
  } catch {
    return d;
  }
}
function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Message Send History Sheet function. */
export function MessageSendHistorySheet({ message, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useMessageSendHistory(message.id, open);

  const statusInfo = STATUS_BADGE[message.status ?? ''] ?? {
    label: message.status ?? 'desconhecido',
    className: 'bg-muted text-muted-foreground',
  };

  const summaryText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`📨 Histórico de envio — ${message.id}`);
    lines.push(`Status atual: ${statusInfo.label}`);
    lines.push(`Tipo: ${message.type}`);
    lines.push(
      `Criada em: ${fmtDate(message.timestamp?.toISOString?.() ?? String(message.timestamp))}`
    );
    if (message.status_updated_at)
      lines.push(`Status atualizado: ${fmtDate(message.status_updated_at)}`);
    if (message.external_id) lines.push(`External ID: ${message.external_id}`);
    if (message.whatsapp_connection_id) lines.push(`Conexão: ${message.whatsapp_connection_id}`);
    if (message.retry_attempt != null && message.retry_total != null) {
      lines.push(`Retry persistido: ${message.retry_attempt}/${message.retry_total}`);
    }
    if (data?.metric) {
      lines.push('');
      lines.push(`— Métricas (evolution_retry_metrics) —`);
      lines.push(
        `Final: ${data.metric.finalStatus}${data.metric.finalHttpStatus ? ` (HTTP ${data.metric.finalHttpStatus})` : ''}`
      );
      lines.push(`Tentativas: ${data.metric.attemptCount}`);
      lines.push(`Duração total: ${fmtMs(data.metric.totalDurationMs)}`);
      if (data.metric.retryReasons.length > 0) {
        lines.push('');
        lines.push(`— Tentativas —`);
        data.metric.retryReasons.forEach((r) => {
          lines.push(
            `#${r.attempt}: ${r.status ? `HTTP ${r.status} ` : ''}${formatFailureReason(r.reason)}`
          );
        });
      }
    } else if (!isLoading) {
      lines.push('');
      lines.push('Nenhuma métrica de retry registrada para esta mensagem.');
    }
    return lines.join('\n');
  }, [message, statusInfo.label, data, isLoading]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast({ title: 'Resumo copiado para área de transferência' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border/50 px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                Histórico de envio
              </SheetTitle>
              <SheetDescription className="mt-1 truncate text-[11px]">
                {message.id}
              </SheetDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-8 shrink-0 gap-1.5 text-xs"
              aria-label="Copiar resumo para área de transferência"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-5">
            {/* Resumo da mensagem */}
            <section className="space-y-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Resumo
              </h3>
              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status atual</span>
                  <Badge className={cn('text-[10px] font-semibold', statusInfo.className)}>
                    {statusInfo.label}
                  </Badge>
                </div>
                <RowKV icon={Hash} label="Tipo" value={message.type} />
                <RowKV
                  icon={Clock}
                  label="Criada em"
                  value={fmtDate(message.timestamp?.toISOString?.() ?? String(message.timestamp))}
                />
                {message.status_updated_at && (
                  <RowKV
                    icon={Clock}
                    label="Status atualizado"
                    value={fmtDate(message.status_updated_at)}
                  />
                )}
                {message.external_id && (
                  <RowKV icon={Hash} label="External ID" value={message.external_id} mono />
                )}
                {message.whatsapp_connection_id && (
                  <RowKV
                    icon={Wifi}
                    label="Conexão"
                    value={message.whatsapp_connection_id}
                    mono
                    truncate
                  />
                )}
                {message.retry_attempt != null && message.retry_total != null && (
                  <RowKV
                    icon={RefreshCw}
                    label="Retry persistido"
                    value={`${message.retry_attempt}/${message.retry_total}`}
                  />
                )}
              </div>
            </section>

            {/* Métricas + Timeline */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Métricas de retry
                </h3>
                {!isLoading && (
                  <button type="button"
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Atualizar métricas"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Atualizar
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : isError ? (
                <p className="text-xs text-destructive">Erro ao carregar métricas.</p>
              ) : !data?.metric ? (
                <p className="text-xs italic text-muted-foreground">
                  Nenhuma métrica registrada — esta mensagem não passou pelo fluxo de retry
                  monitorado.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Tentativas" value={String(data.metric.attemptCount)} />
                    <Metric label="Duração" value={fmtMs(data.metric.totalDurationMs)} />
                    <Metric
                      label="Final"
                      value={
                        data.metric.finalHttpStatus
                          ? `HTTP ${data.metric.finalHttpStatus}`
                          : data.metric.finalStatus
                      }
                      tone={
                        data.metric.finalStatus === 'success' ? 'success' : 'destructive'
                      }
                    />
                  </div>

                  {data.metric.retryReasons.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-border/50">
                      <ol className="divide-y divide-border/50">
                        {data.metric.retryReasons.map((r) => {
                          const isOk =
                            typeof r.status === 'number' && r.status >= 200 && r.status < 300;
                          return (
                            <li key={r.attempt} className="flex items-start gap-2.5 p-2.5 text-xs">
                              <span
                                className={cn(
                                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                                  isOk
                                    ? 'bg-success/20 text-success'
                                    : 'bg-destructive/15 text-destructive'
                                )}
                              >
                                {isOk ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <AlertOctagon className="h-3 w-3" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold">Tentativa #{r.attempt}</span>
                                  {typeof r.status === 'number' && (
                                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                      HTTP {r.status}
                                    </Badge>
                                  )}
                                  {r.duration_ms != null && (
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {fmtMs(r.duration_ms)}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 break-words text-muted-foreground">
                                  {formatFailureReason(r.reason)}
                                </p>
                                {r.at && (
                                  <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/70">
                                    {fmtDate(r.at)}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}

                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    Registrado{' '}
                    {formatDistanceStrict(new Date(data.metric.createdAt), new Date(), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </>
              )}
            </section>

            {/* Audit log */}
            {data?.auditEntries && data.auditEntries.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Audit log ({data.auditEntries.length})
                </h3>
                <ul className="space-y-1.5">
                  {data.auditEntries.map((e) => (
                    <li
                      key={e.id}
                      className="rounded border border-border/40 bg-muted/10 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium">{e.action}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {fmtDate(e.createdAt)}
                        </span>
                      </div>
                      {Boolean(e.details) && (
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Payload bruto */}
            {data?.metric && (
              <section>
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
                    <span>Payload bruto (retry_metrics)</span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-border/50 bg-muted/30 p-2 text-[10px]">
                      {JSON.stringify(data.metric.rawJson, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            )}

            <Separator />
            <p className="text-[10px] italic text-muted-foreground">
              Dica: use "Copiar" para enviar o resumo ao time comercial via chat interno.
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ---------- helpers ----------

function RowKV({
  icon: Icon,
  label,
  value,
  mono,
  truncate,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 text-right text-foreground',
          mono && 'text-[11px]',
          truncate && 'truncate'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'destructive';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2 text-center',
        tone === 'success' && 'border-success/30 bg-success/5',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/5',
        !tone && 'border-border/50 bg-muted/20'
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-sm font-bold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive'
        )}
      >
        {value}
      </p>
    </div>
  );
}