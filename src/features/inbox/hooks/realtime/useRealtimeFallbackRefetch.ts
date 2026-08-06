/**
 * Safety-net refetch for caches that depend on the evolution_contacts
 * realtime channel. If the channel drops (network blip, sleep, server
 * restart) the local cache can drift from the source of truth — this hook
 * mitigates that with two complementary triggers:
 *
 *  1. **Reconnect trigger**: when the realtime status transitions from a
 *     non-connected state (`error`/`disconnected`/`connecting`) back to
 *     `connected`, we immediately invalidate contact caches to close the gap.
 *  2. **Periodic trigger**: every X minutes we invalidate as a safety net,
 *     even when the channel reports healthy. Configurable per instance via
 *     `VITE_REALTIME_FALLBACK_REFETCH_MS` (default 5 min, clamp 30s–60min).
 *
 * Notes:
 * - Only invalidates; React Query handles deduplication and concurrent fetch.
 * - The periodic timer is PAUSED while the document is hidden (timer torn
 *   down on `visibilitychange` → hidden) and RESUMED on the next
 *   `visibilitychange` → visible WITHOUT an immediate refetch — the next
 *   tick runs only after a full period. Returning to the tab / window focus
 *   never triggers a mass refetch here; real channel drops are still covered
 *   by the reconnect trigger.
 */
import { useCallback, useEffect, useRef } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeContactsStatus } from './realtimeContactsStatusStore';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 1000;
const MAX_INTERVAL_MS = 60 * 60 * 1000;

function resolveIntervalMs(): number {
  const raw = (import.meta.env?.VITE_REALTIME_FALLBACK_REFETCH_MS as string | undefined)?.trim();
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(n)));
}

/** Resolved periodic fallback refetch interval in milliseconds, derived from VITE_REALTIME_FALLBACK_INTERVAL_MS env var with 5-minute default. */
export const REALTIME_FALLBACK_REFETCH_MS = resolveIntervalMs();

interface Options {
  enabled?: boolean;
  /** Override the periodic interval (ms). Defaults to env / 5min. */
  intervalMs?: number;
}

/** Periodically invalidates all conversation/message queries as a fallback when the Supabase Realtime channel is disconnected or degraded, preventing stale inboxes. */
export function useRealtimeFallbackRefetch({ enabled = true, intervalMs }: Options = {}) {
  const queryClient = useQueryClient();
  const status = useRealtimeContactsStatus();
  const lastStatusRef = useRef(status);
  const lastRefetchAtRef = useRef(0);

  // Single invalidation routine, throttled to avoid stacking when multiple
  // triggers fire close together (reconnect + periodic + visibility).
  const refetchAll = useCallback((reason: string) => {
    const now = Date.now();
    if (now - lastRefetchAtRef.current < 5_000) return; // 5s throttle
    lastRefetchAtRef.current = now;

    // Console-free: rely on React Query devtools; silent in production.
    void queryClient.invalidateQueries({ queryKey: queryKeys.evolutionConversations.all() });
    // Per-contact caches: invalidate the family (no specific jid).
    void queryClient.invalidateQueries({ queryKey: queryKeys.evolutionConversations.contactAll() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.singleContactRoot() });
    // Tag the reason on the window for ad-hoc debugging.
    try {
      (window as unknown as { __lastRealtimeFallback?: string }).__lastRealtimeFallback = // ignore-audit — window debug tag for devtools inspection
        `${new Date().toISOString()} :: ${reason}`;
    } catch {
      /* noop */
    }
  }, [queryClient]);

  // Reconnect trigger
  useEffect(() => {
    if (!enabled) return;
    const prev = lastStatusRef.current;
    lastStatusRef.current = status;
    if (status === 'connected' && prev !== 'connected' && prev !== 'idle') {
      refetchAll(`reconnect:${prev}->connected`);
    }
  }, [status, enabled, refetchAll]);

  // Periodic + visibility triggers
  useEffect(() => {
    if (!enabled) return;
    const period = intervalMs ?? REALTIME_FALLBACK_REFETCH_MS;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const stopTimer = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const startTimer = () => {
      stopTimer();
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        refetchAll(`periodic:${period}ms`);
      }, period);
    };

    // Pausa REAL com aba oculta: o timer é destruído (zero work enquanto
    // oculto) e recriado ao voltar a ficar visível — SEM refetch imediato.
    // O próximo tick só roda após um período completo; foco/retorno de aba
    // não dispara refetch em massa (quedas reais do canal seguem cobertas
    // pelo reconnect trigger acima).
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        stopTimer();
      } else {
        startTimer();
      }
    };

    startTimer();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      stopTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [enabled, intervalMs, refetchAll]);
}
