// Consolidated Analytics & Monitoring Management Module (ETAPA 39)
// Consolidates: usePerformanceMonitoring, useErrorMonitoring, useRealtimeMonitor, useLatestAnalysis, useMessageAttempts
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

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

export function useMessageAttemptsManagement(messageId: string) {
  const [attempts, setAttempts] = useState<any[]>([]);
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
        setAttempts(data || []);
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
