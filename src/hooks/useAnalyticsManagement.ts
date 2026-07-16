// Consolidated Analytics & Monitoring Management Module (ETAPA 39)
// Consolidates: usePerformanceMonitoring, useErrorMonitoring, useRealtimeMonitor, useLatestAnalysis, useMessageAttempts
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { log } from '@/lib/logger';
import type { Database } from '@/integrations/supabase/schema';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: string;
}

interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  timestamp: string;
  level: 'error' | 'warn' | 'info';
}

interface Analysis {
  id: string;
  metric: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  timestamp: string;
}

export type PerformanceSnapshot = Database['zapp']['Tables']['performance_snapshots']['Row'];
type PerformanceSnapshotInsert = Database['zapp']['Tables']['performance_snapshots']['Insert'];
export type PerformanceSnapshotInput = Omit<
  PerformanceSnapshotInsert,
  'id' | 'profile_id' | 'created_at' | 'user_agent'
>;

export function usePerformanceMonitoringManagement() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const metricsRef = useRef<PerformanceMetric[]>([]);

  const recordMetric = useCallback((name: string, duration: number) => {
    const metric: PerformanceMetric = { name, duration, timestamp: new Date().toISOString() };
    metricsRef.current.push(metric);
    setMetrics([...metricsRef.current]);

    if (metricsRef.current.length > 100) {
      metricsRef.current = metricsRef.current.slice(-100);
    }
  }, []);

  return { metrics, recordMetric };
}

export function usePerformanceSnapshots() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const saveSnapshot = useCallback(
    async (snapshot: PerformanceSnapshotInput) => {
      if (!profile?.id) return;

      try {
        const payload: PerformanceSnapshotInsert = {
          ...snapshot,
          profile_id: profile.id,
          user_agent: navigator.userAgent,
        };

        const { error: err } = await supabase.from('performance_snapshots').insert(payload);
        if (err) throw err;
      } catch (err) {
        log.error('Error saving performance snapshot:', err);
      }
    },
    [profile?.id]
  );

  const loadHistory = useCallback(
    async (hours: number = 24) => {
      if (!profile?.id) {
        if (mountedRef.current) setHistory([]);
        return;
      }

      try {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const { data, error: err } = await supabase
          .from('performance_snapshots')
          .select('*')
          .eq('profile_id', profile.id)
          .gte('created_at', since)
          .order('created_at', { ascending: true })
          .limit(500);

        if (err) throw err;
        if (mountedRef.current) setHistory(data ?? []);
      } catch (err) {
        log.error('Error loading performance snapshots:', err);
        if (mountedRef.current) setHistory([]);
      }
    },
    [profile?.id]
  );

  const clearOldSnapshots = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error: err } = await supabase
        .from('performance_snapshots')
        .delete()
        .eq('profile_id', profile.id)
        .lt('created_at', cutoff);

      if (err) throw err;
      await loadHistory(168);
    } catch (err) {
      log.error('Error clearing old performance snapshots:', err);
    }
  }, [loadHistory, profile?.id]);

  return { history, saveSnapshot, loadHistory, clearOldSnapshots };
}

export function useErrorMonitoringManagement() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorLog: ErrorLog = {
        id: Date.now().toString(),
        message: event.message,
        stack: event.error?.stack,
        timestamp: new Date().toISOString(),
        level: 'error',
      };
      setErrors((prev) => [...prev, errorLog]);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return { errors, clearErrors };
}

export function useLatestAnalysisManagement(timeWindow: number = 24) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const { data, error: err } = await supabase.rpc('get_latest_analysis', {
          hours: timeWindow,
        });

        if (err) throw err;
        setAnalysis(data);
      } catch (err) {
        log.error('Error fetching analysis:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [timeWindow]);

  return { analysis, loading };
}

/** DTO tipado de uma tentativa de envio de mensagem (tabela `message_attempts`). */
export interface MessageAttempt {
  id: string;
  message_id: string;
  attempt_number: number | null;
  status: string | null;
  error_message: string | null;
  created_at: string | null;
}

/** Estreita um registro `unknown` do Supabase para `MessageAttempt` validando os campos. */
function toMessageAttempt(row: unknown): MessageAttempt | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    message_id: typeof r.message_id === 'string' ? r.message_id : '',
    attempt_number: typeof r.attempt_number === 'number' ? r.attempt_number : null,
    status: typeof r.status === 'string' ? r.status : null,
    error_message: typeof r.error_message === 'string' ? r.error_message : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

export function useMessageAttemptsManagement(messageId: string) {
  const [attempts, setAttempts] = useState<MessageAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!messageId) return;

    const fetchAttempts = async () => {
      try {
        const { data, error: err } = await supabase
          .from('message_attempts')
          .select('*')
          .eq('message_id', messageId);

        if (err) throw err;
        // Narrowing: valida cada registro antes de expor aos consumidores.
        setAttempts((Array.isArray(data) ? data : []).map(toMessageAttempt).filter(
          (a): a is MessageAttempt => a !== null
        ));
      } catch (err) {
        log.error('Error fetching message attempts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [messageId]);

  return { attempts, loading };
}

export type { PerformanceMetric, ErrorLog, Analysis };
