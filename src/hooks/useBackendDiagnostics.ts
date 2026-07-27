import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PingStatus = 'idle' | 'checking' | 'ok' | 'error';

export interface PingResult {
  status: PingStatus;
  latencyMs?: number;
  error?: string;
}

export function useBackendDiagnostics() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  const [restPing, setRestPing] = useState<PingResult>({ status: 'idle' });
  const [authPing, setAuthPing] = useState<PingResult>({ status: 'idle' });
  const [dbPing, setDbPing] = useState<PingResult>({ status: 'idle' });
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const runChecks = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    if (!mountedRef.current) return;
    setRestPing({ status: 'checking' });
    try {
      const t0 = performance.now();
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: anonKey ?? '' },
        signal,
      });
      const dt = Math.round(performance.now() - t0);
      if (!mountedRef.current) return;
      setRestPing(
        res.ok
          ? { status: 'ok', latencyMs: dt }
          : { status: 'error', latencyMs: dt, error: `HTTP ${res.status}` }
      );
    } catch (err) {
      if (signal.aborted || !mountedRef.current) return;
      setRestPing({ status: 'error', error: err instanceof Error ? err.message : 'falha' });
    }

    if (!mountedRef.current) return;
    setAuthPing({ status: 'checking' });
    try {
      const t0 = performance.now();
      const { data, error } = await supabase.auth.getSession();
      const dt = Math.round(performance.now() - t0);
      if (!mountedRef.current) return;
      if (error) setAuthPing({ status: 'error', latencyMs: dt, error: error.message });
      else {
        setAuthPing({ status: 'ok', latencyMs: dt });
        setHasSession(!!data.session);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setAuthPing({ status: 'error', error: err instanceof Error ? err.message : 'falha' });
    }

    if (!mountedRef.current) return;
    setDbPing({ status: 'checking' });
    try {
      const t0 = performance.now();
      const { error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      const dt = Math.round(performance.now() - t0);
      if (!mountedRef.current) return;
      // 42501 (RLS) still means DB responded — treat as OK
      if (error && !['42501', 'PGRST301'].includes(error.code ?? '')) {
        setDbPing({
          status: 'error',
          latencyMs: dt,
          error: `${error.code ?? ''} ${error.message}`,
        });
      } else {
        setDbPing({ status: 'ok', latencyMs: dt });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setDbPing({ status: 'error', error: err instanceof Error ? err.message : 'falha' });
    }
  }, [supabaseUrl, anonKey]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  return { restPing, authPing, dbPing, hasSession, runChecks, supabaseUrl, anonKey };
}
