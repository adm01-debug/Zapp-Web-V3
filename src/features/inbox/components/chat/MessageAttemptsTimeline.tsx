// @ts-nocheck
/**
 * MessageAttemptsTimeline — timeline visual da pipeline de envio de uma
 * mensagem: tentativa atual / total, timestamps relevantes e motivo final
 * quando o envio foi resolvido (sucesso ou abandono).
 *
 * Visibilidade: a tabela `failed_messages` é admin/supervisor only via RLS.
 * Para outros perfis o hook retorna `null` e mostramos um aviso curto.
 */
import { format } from 'date-fns';
import { Loader2, CheckCircle2, AlertTriangle, Clock, RotateCw, XCircle, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useMessageAttempts, type AttemptStatus } from '@/hooks/useMessageAttempts';
import { useUserRole } from '@/features/auth';

interface MessageAttemptsTimelineProps {
  messageId: string | null;
  enabled: boolean;
}

const STATUS_META: Record<AttemptStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof Clock }> = {
  pending:   { label: 'Aguardando',  variant: 'secondary',   Icon: Clock },
  retrying:  { label: 'Reenviando',  variant: 'secondary',   Icon: RotateCw },
  succeeded: { label: 'Entregue',    variant: 'default',     Icon: CheckCircle2 },
  failed:    { label: 'Falhou',      variant: 'destructive', Icon: XCircle },
  abandoned: { label: 'Abandonada',  variant: 'destructive', Icon: AlertTriangle },
};

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  try { return format(new Date(ts), 'dd/MM/yyyy HH:mm:ss'); } catch { return ts; }
}

export function MessageAttemptsTimeline({ messageId, enabled }: MessageAttemptsTimelineProps) {
  const { isSupervisor } = useUserRole();
  const canRead = isSupervisor;

  const { data: row, isLoading, error } = useMessageAttempts(messageId, {
    enabled: enabled && canRead,
  });

  if (!canRead) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 border border-dashed rounded-md">
        <ShieldOff className="w-4 h-4" />
        <span>Histórico de tentativas disponível apenas para administradores e supervisores.</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="attempts-loading">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive p-3 border border-destructive/30 rounded-md">
        <AlertTriangle className="w-4 h-4" />
        <span>{error.message}</span>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground p-6 text-center">
        <CheckCircle2 className="w-5 h-5 text-primary" />
        <p>Nenhuma tentativa registrada na fila de retry.</p>
        <p className="text-muted-foreground/70">Envio direto, sem entradas no DLQ.</p>
      </div>
    );
  }

  const meta = STATUS_META[row.status] ?? STATUS_META.pending;
  const StatusIcon = meta.Icon;
  const total = Math.max(1, row.max_retries);
  const current = Math.min(row.retry_count, total);
  const progressPct = Math.round((current / total) * 100);

  const finalReason =
    row.status === 'succeeded'
      ? 'Entregue após retentativa.'
      : row.error_message ?? row.last_retry_reason ?? null;

  return (
    <div className="space-y-4" data-testid="attempts-timeline">
      {/* Cabeçalho: status + contador */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 ${row.status === 'retrying' ? 'animate-spin' : ''}`} />
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          Tentativa <span className=" text-foreground">{current}</span>
          {' / '}
          <span className=" text-foreground">{total}</span>
        </div>
      </div>

      <Progress value={progressPct} className="h-1.5" />

      {/* Grid de timestamps */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-muted/40 rounded-md p-3">
        <div>
          <dt className="text-muted-foreground">Primeiro registro</dt>
          <dd className=" text-foreground">{fmt(row.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Última tentativa</dt>
          <dd className=" text-foreground">{fmt(row.last_attempt_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Próxima tentativa</dt>
          <dd className=" text-foreground">
            {row.status === 'pending' || row.status === 'retrying' ? fmt(row.next_attempt_at) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Concluída em</dt>
          <dd className=" text-foreground">{fmt(row.succeeded_at)}</dd>
        </div>
      </dl>

      {/* Diagnóstico de erro / motivo final */}
      {(row.error_code || row.http_status || finalReason) && (
        <div className="space-y-1.5 text-xs border border-border/60 rounded-md p-3">
          <div className="flex items-center gap-2 flex-wrap">
            {row.error_code && (
              <Badge variant="outline" className=" text-[10px]">
                {row.error_code}
              </Badge>
            )}
            {row.http_status && (
              <Badge variant="outline" className=" text-[10px]">
                HTTP {row.http_status}
              </Badge>
            )}
            <span className="text-muted-foreground">
              {row.status === 'succeeded' ? 'Resultado final' : 'Último motivo'}
            </span>
          </div>
          {finalReason && (
            <p className="text-foreground whitespace-pre-wrap break-words">{finalReason}</p>
          )}
          {row.last_retry_reason && row.last_retry_reason !== row.error_message && (
            <p className="text-muted-foreground italic">
              Reason: {row.last_retry_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
