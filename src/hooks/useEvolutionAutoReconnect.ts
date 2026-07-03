import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { getLogger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/eventBus';

const log = getLogger('useEvolutionAutoReconnect');

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Shape mínimo do payload Realtime de whatsapp_connections
 */
interface WhatsAppConnection {
  id: string;
  name: string;
  instance_id: string;
  status: string;
  health_reason: string | null;
  auto_reconnect_enabled: boolean;
  loop_protection_active: boolean;
  reconnect_interval_seconds: number | null;
  max_reconnect_attempts: number | null;
}

/**
 * Extrai o HTTP status de um erro lançado pelo `callApi` /
 * `supabase.functions.invoke`.
 */
function extractHttpStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e['apiStatus'] === 'number') return e['apiStatus'];
  if (typeof e['status']    === 'number') return e['status'];
  const ctx = e['context'];
  if (ctx != null && typeof ctx === 'object') {
    const s = (ctx as Record<string, unknown>)['status'];
    if (typeof s === 'number') return s;
  }
  return undefined;
}

/**
 * useEvolutionAutoReconnect
 *
 * BUGS CORRIGIDOS (2026-07-03 hotfix):
 *  1. fn_log_reconnection_attempt chamado com parâmetros ERRADOS.
 *     A função real no DB aceita:
 *       (p_connection_id, p_instance_name, p_status, p_error_message,
 *        p_attempt_number, p_qr_generated, p_metadata)
 *     O código anterior enviava:
 *       (p_connection_id, p_attempt, p_status_before, p_reason_before,
 *        p_result, p_error)
 *     Isso causaria erro PostgreSQL 42883 (function does not exist) ou
 *     chamada com todos os params NULL.
 *
 *  2. useEvolutionAutoReconnect usava isReconnecting (state) como
 *     dependência em useCallback → stale closure → double-fire.
 *     Fix: isReconnectingRef para guards sem dep de closure.
 *
 *  3. performReconnect era função plain → capturava restartInstance
 *     stale do render inicial.
 *     Fix: useCallback([restartInstance]).
 *
 *  4. @ts-nocheck removido, tipagem explícita de WhatsAppConnection.
 *
 *  5. 401/403 para o ciclo de retry e emite credential-error event.
 */
export function useEvolutionAutoReconnect(instanceName?: string) {
  const { restartInstance, getInstanceStatus, connectInstance } = useEvolutionApi();
  const queryClient = useQueryClient();
  const attemptMap       = useRef<Record<string, number>>({});
  const lastAttemptTime  = useRef<Record<string, number>>({});

  const [status, setStatus]               = useState<string>('unknown');
  const [isReconnecting, _setIsReconnecting] = useState(false);

  // Ref espelho — evita stale closure em useCallback com deps parciais
  const isReconnectingRef = useRef(false);
  const backoffRef        = useRef(INITIAL_BACKOFF_MS);
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setIsReconnecting = useCallback((v: boolean) => {
    isReconnectingRef.current = v;
    _setIsReconnecting(v);
  }, []);

  // ── 1. Global Realtime Monitoring ─────────────────────────────────────────
  const performReconnect = useCallback(
    async (connection: WhatsAppConnection) => {
      const id  = connection.id;
      const now = Date.now();

      const intervalMs  = (connection.reconnect_interval_seconds ?? 30) * 1_000;
      const maxAttempts = connection.max_reconnect_attempts ?? 5;
      const attempts    = attemptMap.current[id] ?? 0;

      if (now - (lastAttemptTime.current[id] ?? 0) < intervalMs) return;
      if (attempts >= maxAttempts) {
        log.warn(`Reconnection limit reached for ${connection.name}`, { id });
        return;
      }

      log.info(`Auto-reconnecting ${connection.name}`, { attempt: attempts + 1 });
      lastAttemptTime.current[id] = now;
      attemptMap.current[id]      = attempts + 1;

      let status: 'success' | 'failed' = 'success';
      let errorMsg: string | null       = null;

      try {
        await restartInstance(connection.instance_id);
        await new Promise<void>(r => setTimeout(r, 5_000));
        await supabase.functions.invoke('connection-health-check', {
          body: { instanceName: connection.instance_id },
        });
      } catch (err: unknown) {
        status   = 'failed';
        errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Reconnection failed for ${connection.name}`, err);

        const httpStatus = extractHttpStatus(err);
        if (httpStatus === 401 || httpStatus === 403) {
          log.error(
            `Credential error (HTTP ${httpStatus}) for ${connection.name} — aborting reconnect cycle`,
          );
          eventBus.emit('connection:credential-error', {
            instanceName: connection.instance_id,
            connectionName: connection.name,
            status: httpStatus,
          });
          attemptMap.current[id] = maxAttempts;
        }
      }

      // HOTFIX: usar parâmetros corretos da função fn_log_reconnection_attempt
      // Assinatura real: (p_connection_id, p_instance_name, p_status,
      //                   p_error_message, p_attempt_number, p_qr_generated, p_metadata)
      try {
        await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)('fn_log_reconnection_attempt', {
          p_connection_id:  id,
          p_instance_name:  connection.instance_id,
          p_status:         status === 'success' ? 'connected' : 'failed',
          p_error_message:  errorMsg,
          p_attempt_number: attempts + 1,
          p_qr_generated:   false,
          p_metadata:       {
            reconnect_reason: connection.health_reason,
            status_before:    connection.status,
          },
        });
      } catch (rpcErr) {
        log.warn('fn_log_reconnection_attempt RPC falhou (não-crítico)', rpcErr);
      }
    },
    [restartInstance],
  );

  useEffect(() => {
    const channel = supabase
      .channel('evolution-reconnect-monitor')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_connections' },
        (payload) => {
          const connection    = payload.new as WhatsAppConnection;
          const oldConnection = payload.old as Pick<WhatsAppConnection, 'status'>;

          if (!connection.auto_reconnect_enabled || connection.loop_protection_active) return;

          const isDisconnected = connection.status === 'disconnected';
          const isPhantom =
            connection.health_reason === 'phantom_session' ||
            connection.health_reason === 'socket_closed';
          const wasConnected = oldConnection.status === 'connected';

          if ((isDisconnected || isPhantom) && connection.instance_id && wasConnected) {
            void performReconnect(connection);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [performReconnect]);

  // ── 2. Specific Instance Polling ──────────────────────────────────────────
  const scheduleNextAttempt = useCallback(() => {
    setIsReconnecting(false);
    const nextDelay = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    backoffRef.current = nextDelay;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void attemptSpecificReconnect(), nextDelay);
  }, [setIsReconnecting]); // eslint-disable-line react-hooks/exhaustive-deps

  const attemptSpecificReconnect = useCallback(async () => {
    if (!instanceName || isReconnectingRef.current) return;

    setIsReconnecting(true);
    log.info(`Attempting to reconnect specific instance ${instanceName}...`);

    try {
      await connectInstance(instanceName);
      await new Promise<void>(r => setTimeout(r, 5_000));

      const currentStatus = await getInstanceStatus(instanceName);
      const state: string = currentStatus?.instance?.state ?? currentStatus?.state ?? 'unknown';
      setStatus(state);

      if (state === 'open') {
        log.info(`Successfully reconnected instance ${instanceName}`);
        backoffRef.current = INITIAL_BACKOFF_MS;
        setIsReconnecting(false);
        queryClient.invalidateQueries({ queryKey: ['external-evolution'] });
        eventBus.emit('connection:recovered', { instanceName });
      } else {
        scheduleNextAttempt();
      }
    } catch (err: unknown) {
      const httpStatus = extractHttpStatus(err);

      if (httpStatus === 401 || httpStatus === 403) {
        log.error(
          `Credential error (HTTP ${httpStatus}) for ${instanceName} — stopping retry cycle`,
        );
        setIsReconnecting(false);
        eventBus.emit('connection:credential-error', {
          instanceName,
          connectionName: instanceName,
          status: httpStatus,
        });
        return;
      }

      log.error(`Failed to reconnect instance ${instanceName}:`, err);
      scheduleNextAttempt();
    }
  }, [instanceName, connectInstance, getInstanceStatus, queryClient, setIsReconnecting, scheduleNextAttempt]);

  const checkStatus = useCallback(async () => {
    if (!instanceName) return;
    try {
      const currentStatus = await getInstanceStatus(instanceName);
      const state: string = currentStatus?.instance?.state ?? currentStatus?.state ?? 'unknown';
      setStatus(state);

      if (state !== 'open' && state !== 'connecting' && !isReconnectingRef.current) {
        void attemptSpecificReconnect();
      }
    } catch (err: unknown) {
      log.error(`Error checking status for ${instanceName}:`, err);
    }
  }, [instanceName, getInstanceStatus, attemptSpecificReconnect]);

  useEffect(() => {
    if (!instanceName) return;
    void checkStatus();
    const interval = setInterval(() => void checkStatus(), 30_000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkStatus, instanceName]);

  return { status, isReconnecting };
}
