import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { useMonitoringData } from '@/hooks/monitoring/useMonitoringData';
import { useMonitoringActions } from '@/hooks/monitoring/useMonitoringActions';
import { useMonitoringNotifications } from './useMonitoringNotifications';
import type { TimePeriod } from './types';

// Re-export all types for consumers
export type {
  TimePeriod,
  DiagnosticResult,
  ConnectionInfo,
  HealthLog,
  MessageStats,
  WebhookTestResult,
  WebhookConfig,
  UptimeInfo,
  SparklineData,
  InstanceUptime,
} from './types';

export function useEvolutionMonitoring() {
  const [period, setPeriod] = useState<TimePeriod>('12h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(30);
  const periodRef = useRef(period);
  periodRef.current = period;

  const { notificationsEnabled, requestNotifications, checkDisconnections } =
    useMonitoringNotifications();

  const {
    connections,
    healthLogs,
    loading,
    messageStats,
    uptime,
    sparklines,
    instanceUptimes,
    fetchData: rawFetch,
  } = useMonitoringData(checkDisconnections);

  const fetchData = useCallback(
    async (p?: TimePeriod) => {
      await rawFetch(p || periodRef.current);
    },
    [rawFetch]
  );

  const actions = useMonitoringActions(fetchData);

  // Countdown timer
  useEffect(() => {
    if (!autoRefresh) return;
    countdownRef.current = 30;
    setCountdown(30);
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = 30;
        setCountdown(30);
        fetchData();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [autoRefresh, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    logMessagesSubscribe('useEvolutionMonitoring', { event: 'INSERT', table: 'messages' });
    const channel = supabase
      .channel('monitoring-connections')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connections' }, () =>
        fetchData()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'evo', table: 'evolution_messages' }, // FATOR X v6.2: view public não emite
        wrapMessagesHandler<{ new: Record<string, unknown> }>('useEvolutionMonitoring', () =>
          fetchData()
        )
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const changePeriod = useCallback(
    (p: TimePeriod) => {
      setPeriod(p);
      fetchData(p);
    },
    [fetchData]
  );

  return {
    connections,
    healthLogs,
    loading,
    messageStats,
    uptime,
    sparklines,
    instanceUptimes,
    notificationsEnabled,
    requestNotifications,
    period,
    changePeriod,
    autoRefresh,
    setAutoRefresh,
    countdown,
    ...actions,
    refetch: fetchData,
  };
}
