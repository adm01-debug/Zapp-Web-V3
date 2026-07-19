import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, AlertCircle, History, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { formatTimeHMS } from '@/lib/formatters';

const log = getLogger('QrAttemptHistory');

/** Qr Attempt Row interface definition. */
export interface QrAttemptRow {
  id: string;
  status: 'pending' | 'connected' | 'expired' | 'error';
  created_at: string;
  connected_at: string | null;
  expired_at: string | null;
  error_message: string | null;
}

interface Props {
  connectionId: string;
  /** Bumped by the parent whenever a new attempt is logged, so we can refetch. */
  refreshKey?: string | number | null;
  limit?: number;
}

const STATUS_META: Record<
  QrAttemptRow['status'],
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  connected: { label: 'Conectado', icon: CheckCircle2, tone: 'text-status-online' },
  pending: { label: 'Aguardando', icon: Loader2, tone: 'text-muted-foreground' },
  expired: { label: 'Expirado', icon: Clock, tone: 'text-warning-foreground' },
  error: { label: 'Erro', icon: XCircle, tone: 'text-destructive' },
};

/** Qr Attempt History function. */
export function QrAttemptHistory({ connectionId, refreshKey, limit = 5 }: Props) {
  const [rows, setRows] = useState<QrAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('qr_attempts')
        .select('id,status,created_at,connected_at,expired_at,error_message')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (cancelled) return;
      if (error) {
        log.warn('[QrAttemptHistory] fetch error', error);
        setForbidden(true);
        setRows([]);
      } else {
        setRows((data ?? []) as QrAttemptRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId, refreshKey, limit]);

  if (forbidden) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-left">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        Histórico de tentativas
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" /> Nenhuma tentativa registrada ainda.
        </div>
      ) : (
        <ul className="space-y-1.5" aria-label="Últimas tentativas de QR">
          {rows.map((row) => {
            const meta = STATUS_META[row.status] ?? STATUS_META.error;
            const Icon = meta.icon;
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 text-xs"
                title={row.error_message ?? undefined}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      meta.tone,
                      row.status === 'pending' && 'animate-spin'
                    )}
                  />
                  <span className={cn('font-medium', meta.tone)}>{meta.label}</span>
                  {row.error_message && row.status === 'error' && (
                    <span className="truncate text-muted-foreground">— {row.error_message}</span>
                  )}
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatTimeHMS(row.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}