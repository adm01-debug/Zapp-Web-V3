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
  updated_at: string | null;
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
    return () => { mountedRef.current = false; };
  }, []);

  const fetchDegraded = useCallback(async () => {
    const since = new Date(Date.now() - recentWindowMs).toISOString();
    const safeQueries = safeWhatsAppConnectionsQuery(supabase);
    const { data, error } = await safeQueries.getDegraded(since);
    if (!mountedRef.current) return;
    setDegraded(((data as unknown) as DegradedInstance[]) ?? []);
  }, [recentWindowMs]);

  useEffect(() => {
    fetchDegraded();
    const channel = supabase
      .channel('degraded-banner')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_connections' },
        () => fetchDegraded(),
      )
      .subscribe();
    const interval = setInterval(fetchDegraded, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchDegraded]);

  // Re-show whenever the active set of degraded instances changes
  const currentSignature = degraded.map((d) => d.id).sort().join(',');
  const isDismissed = dismissedIds === currentSignature && currentSignature !== '';

  if (degraded.length === 0 || isDismissed) return null;

  const formatDegradedAt = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    } catch { return null; }
  };

  const firstDegradedAt = formatDegradedAt(degraded[0]?.last_health_check ?? null);
  const label = degraded.length === 1
    ? `Conexão "${degraded[0].name || degraded[0].instance_name || 'sem nome'}" rebaixada${firstDegradedAt ? ` em ${firstDegradedAt}` : ''}`
    : `${degraded.length} conexões com desempenho degradado`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -32 }}
        className="fixed top-0 left-0 right-0 z-[85] bg-warning text-warning-foreground shadow-md"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 py-2 px-4 max-w-screen-xl mx-auto">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium truncate">{label}</span>
          <span className="text-xs opacity-80 hidden sm:inline">
            {degraded.length > 1 && firstDegradedAt
              ? `Rebaixamento mais recente em ${firstDegradedAt}.`
              : 'Latência alta ou estado intermitente detectado.'}
          </span>
          <button
            onClick={() => onNavigate('connections')}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-warning-foreground/15 hover:bg-warning-foreground/25 transition-colors"
          >
            Ver conexões
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => setDismissedIds(currentSignature)}
            className="p-1 rounded hover:bg-warning-foreground/20 transition-colors shrink-0"
            aria-label="Fechar alerta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}