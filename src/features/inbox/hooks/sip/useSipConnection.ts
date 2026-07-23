import { useState, useRef, useCallback, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';
import { UserAgent, Registerer } from 'sip.js';
import { toast } from 'sonner';

const log = getLogger('SipConnection');

/** Connection lifecycle state of the SIP.js UserAgent. */
export type SipStatus = 'disconnected' | 'connecting' | 'registered' | 'error';

interface SipConfig {
  server: string;
  user: string;
  password: string;
  wsPort?: number;
}

/** Manages a SIP.js UserAgent connection lifecycle: registers with the server, handles exponential back-off reconnection, and exposes connect/disconnect callbacks with mounted-ref safety. */
export function useSipConnection() {
  const [sipStatus, setSipStatus] = useState<SipStatus>('disconnected');
  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useMountedRef();
  const maxReconnectAttempts = 5;

  useEffect(
    () => () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Tear down the SIP registration and WebSocket transport on unmount, otherwise
      // the UserAgent keeps a registered session and an open socket alive in the background.
      reconnectAttemptsRef.current = maxReconnectAttempts; // suppress auto-reconnect during teardown
      const registerer = registererRef.current;
      const ua = uaRef.current;
      if (ua) ua.transport.onDisconnect = () => {};
      void (async () => {
        try {
          if (registerer) await registerer.unregister();
        } catch {
          /* ignore */
        }
        try {
          if (ua) await ua.stop();
        } catch {
          /* ignore */
        }
      })();
      registererRef.current = null;
      uaRef.current = null;
    },
    []
  );

  const connect = useCallback(async (config: SipConfig) => {
    try {
      setSipStatus('connecting');
      // Stop any existing UserAgent before creating a new one, so a reconnect
      // does not leave a second registered session / open socket behind.
      if (uaRef.current) {
        uaRef.current.transport.onDisconnect = () => {};
        try {
          if (registererRef.current) await registererRef.current.unregister();
        } catch {
          /* ignore */
        }
        try {
          await uaRef.current.stop();
        } catch {
          /* ignore */
        }
        uaRef.current = null;
        registererRef.current = null;
      }
      const wsPort = config.wsPort || 8089;
      const wsServer = `wss://${config.server}:${wsPort}/ws`;
      const uri = UserAgent.makeURI(`sip:${config.user}@${config.server}`);
      if (!uri) throw new Error('URI SIP inválida');

      const ua = new UserAgent({
        uri,
        transportOptions: { server: wsServer, traceSip: false },
        authorizationPassword: config.password,
        authorizationUsername: config.user,
        logLevel: 'warn',
        displayName: config.user,
      });

      ua.transport.onDisconnect = () => {
        if (!mountedRef.current) return;
        setSipStatus('disconnected');
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          toast.info(
            `Conexão perdida. Reconectando em ${delay / 1000}s... (tentativa ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (mountedRef.current) connect(config);
          }, delay);
        } else {
          toast.error('Não foi possível reconectar ao servidor VoIP.');
          reconnectAttemptsRef.current = 0;
        }
      };

      await ua.start();
      if (!mountedRef.current) {
        await ua.stop().catch(() => {});
        return;
      }
      const registerer = new Registerer(ua);
      registerer.stateChange.addListener((state) => {
        if (!mountedRef.current) return;
        if (state === 'Registered') {
          setSipStatus('registered');
          reconnectAttemptsRef.current = 0;
          toast.success('VoIP conectado!');
        } else if (state === 'Unregistered' || state === 'Terminated') setSipStatus('disconnected');
      });
      await registerer.register();
      uaRef.current = ua;
      registererRef.current = registerer;
    } catch (err: unknown) {
      log.error('SIP connection error:', err);
      if (mountedRef.current) setSipStatus('error');
      toast.error(
        `Erro ao conectar VoIP: ${err instanceof Error ? err.message : 'Falha na conexão'}`
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(async () => {
    try {
      reconnectAttemptsRef.current = maxReconnectAttempts;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (registererRef.current) await registererRef.current.unregister();
      if (uaRef.current) {
        uaRef.current.transport.onDisconnect = () => {};
        await uaRef.current.stop();
      }
      if (mountedRef.current) setSipStatus('disconnected');
      reconnectAttemptsRef.current = 0;
    } catch (err) {
      log.error('SIP disconnect error:', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { sipStatus, uaRef, connect, disconnect };
}
