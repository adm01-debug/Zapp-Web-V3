import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { getLogger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/eventBus';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

const log = getLogger('useEvolutionAutoReconnect');

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
/**
 * ISSUE #3 FIX (2026-07-05): attemptSpecificReconnect already had exponential
 * backoff (2s -> 60s) but NO upper bound on attempt count — it would retry
 * forever at the 60s ceiling if the Evolution instance never recovered.
 * This cap stops the active-reconnect loop after N consecutive failures and
 * emits an event so the UI can prompt for manual intervention.
 */
const MAX_CONSECUTIVE_RECONNECT_ATTEMPTS = 20; // ~20-30min of backoff before giving up

/**
 * Circuit-breaker constants for the status-polling loop.
 *
 * On credential errors (401/403): polling halted PERMANENTLY for the session.
 * On transient 5xx / network: exponential back-off after CIRCUIT_THRESHOLD
 * consecutive failures.  Successful response resets the counter.
 */
const CIRCUIT_THRESHOLD = 3; // consecutive failures to open circuit
const CIRCUIT_BASE_MS = 2 * 60_000; // 2 min — first cool-down window
const CIRCUIT_MAX_MS = 10 * 60_000; // 10 min — ceiling

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
 * Extrai o HTTP status de um erro lançado pelo callApi /
 * supabase.functions.invoke.
 */
function extractHttpStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e['apiStatus'] === 'number') return e['apiStatus'];
  if (typeof e['status'] === 'number') return e['status'];
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
 *  1. fn_log_reconnection_attempt chamado com parametros ERRADOS (PR #130).
 *  2. stale closure em isReconnecting (PR #127).
 *  3. performReconnect nao memoizado (PR #127).
 *  4. ts-nocheck supression removed (PR #127).
 *  5. 401/403 aborta ciclo de retry (PR #127).
 *  6. p_status='connected' viola chk_reconnection_status (PR anterior).
 *  7. p_connection_id recebia whatsapp_connections.id (PR anterior).
 *
 * BUGS CORRIGIDOS (2026-07-05):
 *  8. RETRY STORM: checkStatus nao abortava em erros de credencial (401/403).
 *     O setInterval de 30s continuava disparando indefinidamente.
 *     Fix: circuit-breaker permanente em 401/403 + exponencial em 5xx >=3.
 *  9. isRetriableStatus (useEvolutionApiCore) nao excluia explicitamente 401/403.
 *     Corrigido no arquivo irmao useEvolutionApiCore.ts.
 */
export function useEvolutionAutoReconnect(instanceName?: string) {
  const { restartInstance, getInstanceStatus, connectInstance } = useEvolutionApi();
  const queryClient = useQueryClient();
  const attemptMap = useRef<Record<string, number>>({});
  const lastAttemptTime = useRef<Record<string, number>>({});

  const [status, setStatus] = useState<string>('unknown');
  const [isReconnecting, _setIsReconnecting] = useState(false);

  // Ref espelho — evita stale closure em useCallback com deps parciais
  const isReconnectingRef = useRef(false);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Consecutive attemptSpecificReconnect failures (resets on success or instanceName change). */
  const reconnectAttemptCountRef = useRef(0);

  // ── Circuit-breaker state (§2 status polling) ──────────────────────────────────────
  /** Permanent flag: halts polling forever on 401/403 for this session. */
  const credentialErrorRef = useRef(false);
  /** Counter for consecutive non-credential failures (5xx / network). */
  const consecutiveFailsRef = useRef(0);
  /** Epoch ms: polling is suspended until this timestamp. */
  const circuitOpenUntilRef = useRef(0);

  const setIsReconnecting = useCallback((v: boolean) => {
    isReconnectingRef.current = v;
    _setIsReconnecting(v);
  }, []);

  // Reset circuit-breaker when instanceName changes (new connection context)
  useEffect(() => {
    credentialErrorRef.current = false;
    consecutiveFailsRef.current = 0;
    circuitOpenUntilRef.current = 0;
    reconnectAttemptCountRef.current = 0;
    backoffRef.current = INITIAL_BACKOFF_MS;
  }, [instanceName]);

  // ── 1. Global Realtime Monitoring ──────────────────────────────────────────────────
  const performReconnect = useCallback(
    async (connection: WhatsAppConnection) => {
      const id = connection.id;
      const now = Date.now();

      const intervalMs = (connection.reconnect_interval_seconds ?? 30) * 1_000;
      const maxAttempts = connection.max_reconnect_attempts ?? 5;
      const attempts = attemptMap.current[id] ?? 0;

      if (now - (lastAttemptTime.current[id] ?? 0) < intervalMs) return;
      if (attempts >= maxAttempts) {
        log.warn(`Reconnection limit reached for ${connection.name}`, { id });
        return;
      }

      const evoInstanceName = evolutionInstanceName(connection);
      if (!evoInstanceName) {
        log.warn(`Auto-reconnect bloqueado: conexao "${connection.name}" sem instance_name`, {
          id,
        });
        return;
      }

      log.info(`Auto-reconnecting ${connection.name}`, { attempt: attempts + 1 });
      lastAttemptTime.current[id] = now;
      attemptMap.current[id] = attempts + 1;

      let attemptStatus: 'success' | 'failed' = 'success';
      let errorMsg: string | null = null;

      try {
        await restartInstance(evoInstanceName);
        await new Promise<void>((r) => setTimeout(r, 5_000));
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
            `Credential error (HTTP ${httpStatus}) for ${connection.name} — aborting reconnect cycle`
          );
          eventBus.emit('connection:credential-error', {
            instanceName: evoInstanceName,
            connectionName: connection.name,
            status: httpStatus,
          });
          attemptMap.current[id] = maxAttempts;
        }
      }

      try {
        await safeClient.rpc<unknown>('fn_log_reconnection_attempt', {
          p_connection_id: null,
          p_instance_name: evoInstanceName,
          p_status: attemptStatus,
          p_error_message: errorMsg,
          p_attempt_number: attempts + 1,
          p_qr_generated: false,
          p_metadata: {
            whatsapp_connection_id: id,
            reconnect_reason: connection.health_reason,
            status_before: connection.status,
          },
        });
      } catch (rpcErr) {
        log.warn('fn_log_reconnection_attempt RPC falhou (nao-critico)', rpcErr);
      }
    },
    [restartInstance]
  );

  useEffect(() => {
    const channel = supabase
      .channel('evolution-reconnect-monitor')
      .on<WhatsAppConnection>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'whatsapp_connections' },
        (payload) => {
          const connection = payload.new;
          const oldConnection = payload.old;

          if (!connection.auto_reconnect_enabled || connection.loop_protection_active) return;

          const isDisconnected = connection.status === 'disconnected';
          const isPhantom =
            connection.health_reason === 'phantom_session' ||
            connection.health_reason === 'socket_closed';
          const wasConnected = oldConnection.status === 'connected';

          if ((isDisconnected || isPhantom) && connection.instance_id && wasConnected) {
            void performReconnect(connection);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [performReconnect]);

  // ── 2. Specific Instance Polling ──────────────────────────────────────────────────
  const scheduleNextAttempt = useCallback(() => {
    setIsReconnecting(false);

    reconnectAttemptCountRef.current += 1;
    if (reconnectAttemptCountRef.current >= MAX_CONSECUTIVE_RECONNECT_ATTEMPTS) {
      log.error(
        `Giving up on ${instanceName}: ${reconnectAttemptCountRef.current} consecutive ` +
          `reconnect attempts failed — manual intervention required`
      );
      eventBus.emit('connection:reconnect-exhausted', {
        instanceName,
        attempts: reconnectAttemptCountRef.current,
      });
      return; // stop scheduling — caller must manually retry (e.g. via UI button)
    }

    const nextDelay = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    backoffRef.current = nextDelay;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void attemptSpecificReconnect(), nextDelay);
  }, [setIsReconnecting, instanceName]); // eslint-disable-line react-hooks/exhaustive-deps

  const attemptSpecificReconnect = useCallback(async () => {
    if (!instanceName || isReconnectingRef.current) return;

    setIsReconnecting(true);
    log.info(`Attempting to reconnect specific instance ${instanceName}...`);

    try {
      await connectInstance(instanceName);
      await new Promise<void>((r) => setTimeout(r, 5_000));

      const currentStatus = await getInstanceStatus(instanceName);
      const state: string = currentStatus?.instance?.state ?? currentStatus?.state ?? 'unknown';
      setStatus(state);

      if (state === 'open') {
        log.info(`Successfully reconnected instance ${instanceName}`);
        backoffRef.current = INITIAL_BACKOFF_MS;
        reconnectAttemptCountRef.current = 0; // reset on success
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
          `Credential error (HTTP ${httpStatus}) for ${instanceName} — stopping retry cycle`
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
  }, [
    instanceName,
    connectInstance,
    getInstanceStatus,
    queryClient,
    setIsReconnecting,
    scheduleNextAttempt,
  ]);

  /**
   * Polling loop (30 s interval).
   *
   * BUG #8 FIX — Circuit-breaker:
   *
   * BEFORE: Any error was swallowed (just logged). On 401/403 the
   * setInterval kept firing every 30s → permanent retry storm.
   *
   * AFTER:
   *  401/403 → credentialErrorRef = true (permanent halt) + event emitted.
   *  >=CIRCUIT_THRESHOLD consecutive 5xx/network → circuitOpenUntilRef set
   *  to (now + exponential back-off). Calls skip until cool-down expires.
   *  Any success → consecutiveFailsRef reset to 0.
   */
  const checkStatus = useCallback(async () => {
    if (!instanceName) return;

    // Guard 1: Permanent halt on credential error (401/403)
    if (credentialErrorRef.current) {
      log.debug(`Skipping check for ${instanceName}: credential error halted polling`);
      return;
    }

    // Guard 2: Temporary back-off due to consecutive 5xx / network failures
    const now = Date.now();
    if (circuitOpenUntilRef.current > now) {
      const remainingSec = Math.round((circuitOpenUntilRef.current - now) / 1_000);
      log.debug(`Circuit open for ${instanceName} — skipping (resumes in ${remainingSec}s)`);
      return;
    }

    try {
      const currentStatus = await getInstanceStatus(instanceName);
      const state: string = currentStatus?.instance?.state ?? currentStatus?.state ?? 'unknown';
      setStatus(state);

      // Reset failure counter on any success
      consecutiveFailsRef.current = 0;

      if (state !== 'open' && state !== 'connecting' && !isReconnectingRef.current) {
        void attemptSpecificReconnect();
      }
    } catch (err: unknown) {
      log.error(`Error checking status for ${instanceName}:`, err);
      const httpStatus = extractHttpStatus(err);

      // Credential error → permanent halt + event
      if (httpStatus === 401 || httpStatus === 403) {
        log.error(
          `Credential error (HTTP ${httpStatus}) for ${instanceName} — ` +
            `halting status polling permanently for this session`
        );
        credentialErrorRef.current = true;
        setIsReconnecting(false);
        eventBus.emit('connection:credential-error', {
          instanceName,
          connectionName: instanceName,
          status: httpStatus,
        });
        return;
      }

      // Transient error → exponential back-off circuit breaker
      consecutiveFailsRef.current += 1;
      const failures = consecutiveFailsRef.current;

      if (failures >= CIRCUIT_THRESHOLD) {
        const exponent = failures - CIRCUIT_THRESHOLD;
        const backoffMs = Math.min(CIRCUIT_BASE_MS * 2 ** exponent, CIRCUIT_MAX_MS);
        circuitOpenUntilRef.current = Date.now() + backoffMs;
        log.warn(
          `Circuit breaker opened for ${instanceName}: ` +
            `${failures} consecutive failure(s), pausing ${Math.round(backoffMs / 1_000)}s`
        );
      }
    }
  }, [instanceName, getInstanceStatus, attemptSpecificReconnect, setIsReconnecting]);

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