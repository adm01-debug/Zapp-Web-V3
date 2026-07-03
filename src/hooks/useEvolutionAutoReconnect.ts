import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { getLogger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/eventBus';

const log = getLogger('useEvolutionAutoReconnect');

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

/** Shape mínimo do payload Realtime de whatsapp_connections */
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
 * `supabase.functions.invoke`. Retorna `undefined` quando
 * o status não é determinável (ex.: timeout, rede).
 */
function extractHttpStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e['apiStatus'] === 'number') return e['apiStatus'];
  if (typeof e['status']    === 'number') return e['status'];
  // Supabase FunctionsHttpError leva o status em `context.status`
  const ctx = e['context'];
  if (ctx != null && typeof ctx === 'object') {
    const s = (ctx as Record<string, unknown>)['status'];
    if (typeof s === 'number') return s;
  }
  return undefined;
}

/**
 * useEvolutionAutoReconnect — Hook de reconexão automática
 *
 * 1. Monitoramento global via Realtime de `whatsapp_connections`
 *    (reconecta qualquer instância que saia do ar enquanto a janela
 *    estiver aberta).
 * 2. Polling de instância específica (legado / Inbox).
 *
 * BUGS CORRIGIDOS nesta versão:
 *   - Removido `@ts-nocheck` que mascarava erros de tipo reais.
 *   - 401 Unauthorized agora **interrompe** o ciclo de retry — não
 *     faz sentido repetir quando as credenciais estão erradas.
 *   - `isReconnecting` usa ref interna para não criar stale closures
 *     em callbacks memoizados (`useCallback`).
 *   - `performReconnect` é estabilizado como `useCallback` (antes era
 *     uma função plain que capturava `restartInstance` do render inicial).
 */
export function useEvolutionAutoReconnect(instanceName?: string) {
  const { restartInstance, getInstanceStatus, connectInstance } = useEvolutionApi();
  const queryClient = useQueryClient();
  const attemptMap       = useRef<Record<string, number>>({});
  const lastAttemptTime  = useRef<Record<string, number>>({});

  // Estado visível para consumers
  const [status, setStatus]               = useState<string>('unknown');
  const [isReconnecting, _setIsReconnecting] = useState(false);

  // Ref espelho de isReconnecting → evita stale closure em useCallback com
  // deps vazias ou parciais sem disparar re-criação desnecessária do callback.
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

      let result: 'success' | 'failed' = 'success';
      let errorMsg: string | null       = null;

      try {
        await restartInstance(connection.instance_id);
        // Aguarda o boot da instância antes de verificar o health
        await new Promise<void>(r => setTimeout(r, 5_000));
        await supabase.functions.invoke('connection-health-check', {
          body: { instanceName: connection.instance_id },
        });
      } catch (err: unknown) {
        result   = 'failed';
        errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Reconnection failed for ${connection.name}`, err);

        // 401 = credenciais inválidas → não faz sentido tentar de novo.
        // Emitimos um evento para a UI exibir alerta ao operador.
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
          // Resetar contador para não bloquear futuras tentativas após
          // o operador corrigir a chave
          attemptMap.current[id] = maxAttempts; // esgota para esta sessão
        }
      }

      try {
        await supabase.rpc('fn_log_reconnection_attempt', {
          p_connection_id:  id,
          p_attempt:        attempts + 1,
          p_status_before:  connection.status,
          p_reason_before:  connection.health_reason,
          p_result:         result,
          p_error:          errorMsg,
        });
      } catch (rpcErr) {
        // Log silencioso — falha no log de auditoria não deve impedir o fluxo
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

  // ── 2. Specific Instance Polling (Legacy / Inbox) ─────────────────────────
  const scheduleNextAttempt = useCallback(() => {
    setIsReconnecting(false);
    const nextDelay = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    backoffRef.current = nextDelay;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void attemptSpecificReconnect(), nextDelay);
  }, [setIsReconnecting]); // eslint-disable-line react-hooks/exhaustive-deps
  // (attemptSpecificReconnect referenciado via iife para evitar ciclo de deps)

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

      // 401 / 403 = credenciais erradas → parar loop de retry
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
        return; // não agenda próxima tentativa
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

      // Usa ref para evitar stale closure — `isReconnectingRef` reflete o
      // valor atual de `isReconnecting` sem precisar estar nas deps do callback
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
