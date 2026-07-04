import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { getLogger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/eventBus';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

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
  instance_name?: string | null;
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
 * BUGS CORRIGIDOS (2026-07-03):
 *  1. fn_log_reconnection_attempt chamado com parâmetros ERRADOS (PR #130).
 *  2. stale closure em isReconnecting (PR #127).
 *  3. performReconnect não memoizado (PR #127).
 *  4. @ts-nocheck removido (PR #127).
 *  5. 401/403 aborta ciclo de retry (PR #127).
 *  6. [ESTE COMMIT] p_status='connected' viola chk_reconnection_status.
 *     zapp.reconnection_logs aceita apenas:
 *       ['attempting','success','failed','timeout','cancelled']
 *     O código anterior enviava 'connected' → CHECK VIOLATION silenciosa.
 *     Fix: status === 'success' ? 'success' : 'failed'
 *  7. [ESTE COMMIT] p_connection_id recebia whatsapp_connections.id que
 *     aponta para FK zapp.channel_connections(id) — tabela vazia.
 *     Isso causaria FK violation em toda tentativa de log.
 *     Fix: p_connection_id=NULL (FK é nullable); whatsapp_connection_id
 *     preservado em p_metadata para rastreabilidade.
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

      // Evolution API roteia por NOME de instância; o UUID (instance_id) gera 404
      // e pode disparar auto-create de instância fantasma (incidente wpp2 2026-07-04).
      const evoInstanceName = evolutionInstanceName(connection);
      if (!evoInstanceName) {
        log.warn(`Auto-reconnect bloqueado: conexão "${connection.name}" sem instance_name`, { id });
        return;
      }

      log.info(`Auto-reconnecting ${connection.name}`, { attempt: attempts + 1 });
      lastAttemptTime.current[id] = now;
      attemptMap.current[id]      = attempts + 1;

      let attemptStatus: 'success' | 'failed' = 'success';
      let errorMsg: string | null             = null;

      try {
        await restartInstance(evoInstanceName);
        await new Promise<void>(r => setTimeout(r, 5_000));
        await supabase.functions.invoke('connection-health-check', {
          body: { instanceName: evoInstanceName },
        });
      } catch (err: unknown) {
        attemptStatus = 'failed';
        errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Reconnection failed for ${connection.name}`, err);

        const httpStatus = extractHttpStatus(err);
        if (httpStatus === 401 || httpStatus === 403) {
          log.error(
            `Credential error (HTTP ${httpStatus}) for ${connection.name} — aborting reconnect cycle`,
          );
          eventBus.emit('connection:credential-error', {
            instanceName: evoInstanceName,
            connectionName: connection.name,
            status: httpStatus,
          });
          attemptMap.current[id] = maxAttempts;
        }
      }

      // HOTFIX Bug 6: p_status 'connected' viola chk_reconnection_status.
      // Valores válidos: ['attempting','success','failed','timeout','cancelled'].
      // HOTFIX Bug 7: p_connection_id não pode ser whatsapp_connections.id pois
      // a FK aponta para zapp.channel_connections (tabela separada/vazia).
      // Solucao: p_connection_id=NULL (FK nullable), whatsapp_connection_id em metadata.
      try {
        await (supabase.rpc as unknown as (n: string, a: unknown) => Promise<unknown>)('fn_log_reconnection_attempt', {
          p_connection_id:  null,                     // Bug 7 fix: FK ref vazia
          p_instance_name:  evoInstanceName,
          p_status:         attemptStatus,             // Bug 6 fix: 'success'|'failed'
          p_error_message:  errorMsg,
          p_attempt_number: attempts + 1,
          p_qr_generated:   false,
          p_metadata: {
            whatsapp_connection_id: id,               // rastreabilidade via metadata
            reconnect_reason:       connection.health_reason,
            status_before:          connection.status,
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

    return () => { void supabase.removeChannel(channel); };
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
