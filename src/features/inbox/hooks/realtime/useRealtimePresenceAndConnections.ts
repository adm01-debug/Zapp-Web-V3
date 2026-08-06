/**
 * Shared Realtime subscription for `zapp.agent_presence` and
 * `zapp.whatsapp_connections`.
 *
 * Replaces the continuous ~60s polling observed in production (banner,
 * connection cache hot paths) with postgres_changes events:
 *   - agent_presence events      → invalidate agents-with-stats queries
 *                                  (throttled 60s — presence heartbeats are
 *                                  high-frequency, the query is 4-parallel-fetch);
 *   - whatsapp_connections events → invalidate connections query family +
 *                                  module cache (`whatsappConnectionsCache`),
 *                                  throttled 3s to coalesce bursts.
 *
 * Fallback safety net (only when the channel is unhealthy):
 *   - 120s timer that re-runs the same invalidations while the subscription
 *     is in `error`/`closed` (never while healthy — no polling when
 *     realtime is delivering);
 *   - one immediate invalidation when the channel reconnects
 *     (error/closed → connected) to close the drift gap.
 * Skipped while the document is hidden.
 *
 * This is a fire-and-forget hook: mount it once at app-shell level
 * (IndexContentConnected). Consumers keep their own initial fetch —
 * only the continuous polling is removed.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { invalidateWhatsappConnectionsCache } from '@/lib/whatsappConnectionsCache';

const FALLBACK_POLL_MS = 120_000;
const PRESENCE_INVALIDATE_THROTTLE_MS = 60_000;
const CONNECTIONS_INVALIDATE_THROTTLE_MS = 3_000;

type ChannelState = 'connecting' | 'connected' | 'error' | 'closed';

function toChannelState(status: string): ChannelState {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'error';
  if (status === 'CLOSED') return 'closed';
  return 'connecting';
}

/** Tag de debug no window (padrão do repo) — console-free em produção. */
function tagLastInvalidation(reason: string): void {
  try {
    (window as unknown as { __lastPresenceConnectionsInvalidation?: string })
      .__lastPresenceConnectionsInvalidation = // ignore-audit — window debug tag for devtools inspection
      `${new Date().toISOString()} :: ${reason}`;
  } catch {
    /* noop in non-DOM env */
  }
}

/** Mount once at app-shell level: realtime-driven invalidation for presence + connections with 120s fallback polling. */
export function useRealtimePresenceAndConnections(): void {
  const queryClient = useQueryClient();
  const channelStateRef = useRef<ChannelState>('connecting');
  const lastStateRef = useRef<ChannelState>('connecting');
  const lastPresenceInvalidateAtRef = useRef(0);
  const lastConnectionsInvalidateAtRef = useRef(0);

  useEffect(() => {
    const invalidatePresence = (reason: string) => {
      const now = Date.now();
      if (now - lastPresenceInvalidateAtRef.current < PRESENCE_INVALIDATE_THROTTLE_MS) return;
      lastPresenceInvalidateAtRef.current = now;
      // agent_presence → useAgents/AgentsView (agents-with-stats family)
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentGamification.withStats() });
      tagLastInvalidation(reason);
    };

    const invalidateConnections = (reason: string) => {
      const now = Date.now();
      if (now - lastConnectionsInvalidateAtRef.current < CONNECTIONS_INVALIDATE_THROTTLE_MS) return;
      lastConnectionsInvalidateAtRef.current = now;
      // whatsapp_connections → connections list/health queries + module cache
      void queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() });
      invalidateWhatsappConnectionsCache();
      tagLastInvalidation(reason);
    };

    // Topic único por mount — evita reutilizar instância de canal já inscrita
    // cujo teardown (removeChannel assíncrono) ainda não terminou.
    const channelName = `presence-connections:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'agent_presence' },
        () => invalidatePresence('postgres_changes:agent_presence')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'whatsapp_connections' },
        () => invalidateConnections('postgres_changes:whatsapp_connections')
      )
      .subscribe((status) => {
        channelStateRef.current = toChannelState(status);
        // Reconnect: fechar o gap de dados acumulado durante a queda.
        if (
          channelStateRef.current === 'connected' &&
          (lastStateRef.current === 'error' || lastStateRef.current === 'closed')
        ) {
          invalidatePresence(`reconnect:${lastStateRef.current}->connected`);
          invalidateConnections(`reconnect:${lastStateRef.current}->connected`);
        }
        lastStateRef.current = channelStateRef.current;
      });

    // Fallback polling 120s: SÓ em erro/fechado. Canal saudável → sem polling.
    const fallbackTimer = setInterval(() => {
      const state = channelStateRef.current;
      if (state !== 'error' && state !== 'closed') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      invalidatePresence(`fallback:${state}`);
      invalidateConnections(`fallback:${state}`);
    }, FALLBACK_POLL_MS);

    const onVisible = () => {
      const state = channelStateRef.current;
      if (typeof document === 'undefined' || document.hidden) return;
      if (state === 'error' || state === 'closed') {
        invalidatePresence(`visibility:${state}`);
        invalidateConnections(`visibility:${state}`);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      clearInterval(fallbackTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
