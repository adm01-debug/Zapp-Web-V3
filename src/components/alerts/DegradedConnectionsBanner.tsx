import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeWhatsAppConnectionsQuery } from '@/integrations/supabase/safe-queries';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';

interface DegradedInstance {
  id: string;
  name: string | null;
  instance_name: string | null;
  health_status: string | null;
  health_response_ms: number | null;
  last_health_check: string | null;
}

interface Props {
  onNavigate: (view: string) => void;
  /** How recent (ms) a degraded health_check must be to surface. Defaults to 10 min. */
  recentWindowMs?: number;
}

/**
 * Global top-of-page banner shown whenever any whatsapp_connection has a
 * recent `health_status = 'degraded'`. Provides a one-click jump to the
 * Connections view so the user can investigate.
 */
export function DegradedConnectionsBanner({ onNavigate, recentWindowMs = 10 * 60 * 1000 }: Props) {
  const [degraded, setDegraded] = useState<DegradedInstance[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string>('');
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchDegraded = useCallback(async () => {
    const since = new Date(Date.now() - recentWindowMs).toISOString();
    const safeQueries = safeWhatsAppConnectionsQuery(supabase as never);
    const { data } = await safeQueries.getDegraded(since);
    if (!mountedRef.current) return;
    // `data` pode vir como SelectQueryError quando alguma coluna do select
    // não existe no schema atual — nesse caso, tratamos como lista vazia.
    const rows: DegradedInstance[] = Array.isArray(data)
      ? (data as unknown as DegradedInstance[])
      : [];
    setDegraded(rows);
  }, [recentWindowMs]);

  useEffect(() => {
    fetchDegraded();
    const channel = supabase
      .channel('degraded-banner')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'whatsapp_connections' },
        () => fetchDegraded()
      )
      .subscribe();
    const interval = setInterval(fetchDegraded, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchDegraded]);

  // Re-show whenever the active set of degraded instances changes
  const currentSignature = degraded
    .map((d) => d.id)
    .sort()
    .join(',');
  const isDismissed = dismissedIds === currentSignature && currentSignature !== '';

  if (degraded.length === 0 || isDismissed) return null;

  const formatDegradedAt = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const firstDegradedAt = formatDegradedAt(degraded[0]?.last_health_check ?? null);
  const label =
    degraded.length === 1
      ? `Conexão "${degraded[0].name || degraded[0].instance_name || 'sem nome'}" rebaixada${firstDegradedAt ? ` em ${firstDegradedAt}` : ''}`
      : `${degraded.length} conexões com desempenho degradado`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -32 }}
        className="fixed left-0 right-0 top-0 z-[85] bg-warning text-warning-foreground shadow-md"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="hidden text-xs opacity-80 sm:inline">
            {degraded.length > 1 && firstDegradedAt
              ? `Rebaixamento mais recente em ${firstDegradedAt}.`
              : 'Latência alta ou estado intermitente detectado.'}
          </span>
          <button type="button"
            onClick={() => onNavigate('connections')}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-warning-foreground/15 px-3 py-1 text-xs font-semibold transition-colors hover:bg-warning-foreground/25"
          >
            Ver conexões
            <ArrowRight className="h-3 w-3" />
          </button>
          <button type="button"
            onClick={() => setDismissedIds(currentSignature)}
            className="shrink-0 rounded p-1 transition-colors hover:bg-warning-foreground/20"
            aria-label="Fechar alerta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
