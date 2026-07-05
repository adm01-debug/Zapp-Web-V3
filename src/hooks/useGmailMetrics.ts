
import { useCallback, useEffect, useState } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailMappers } from '@/utils/emailMappers';
import {
  EmailMetricsSummary,
  EmailSLADashboard
} from '@/types/gmail';
import { getLogger } from '@/lib/logger';

const log = getLogger('useEmailMetrics');

export function useEmailMetrics(accountId: string | null, days = 7) {
  const [summary, setSummary]     = useState<EmailMetricsSummary | null>(null);
  const [slaDash, setSlaDash]     = useState<EmailSLADashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!accountId) return;

    setIsLoading(true);
    setError(null);
    try {
      const sinceDate = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];

      const { data: dailyData, error: dbErr, requestId } = await safeClient.from('email_daily_metrics', (q) =>
        q.select('date, threads_received, threads_replied, avg_first_reply_minutes, sla_met_count, sla_breached_count')
         .eq('account_id', accountId)
         .gte('date', sinceDate)
         .order('date', { ascending: true })
      );

      if (dbErr) {
        log.warn('Email metrics load error', dbErr.message);
        throw dbErr;
      }

      const daily = emailMappers.metrics(Array.isArray(dailyData) ? dailyData : []);

      const total_received   = daily.reduce((s, d) => s + (d.threads_received ?? 0), 0);
      const total_replied    = daily.reduce((s, d) => s + (d.threads_replied ?? 0), 0);
      const total_sla_met    = daily.reduce((s, d) => s + (d.sla_met_count ?? 0), 0);
      const total_sla_breach = daily.reduce((s, d) => s + (d.sla_breached_count ?? 0), 0);
      const reply_minutes    = daily
        .filter(d => d.avg_first_reply_minutes !== null)
        .map(d => d.avg_first_reply_minutes!);

      const avg_reply = reply_minutes.length > 0
        ? Math.round(reply_minutes.reduce((s, m) => s + m, 0) / reply_minutes.length)
        : null;

      const sla_total = total_sla_met + total_sla_breach;

      setSummary({
        period:              `${days} dias`,
        total_received,
        total_replied,
        reply_rate:          total_received > 0 ? Math.round((total_replied / total_received) * 100) : 0,
        avg_reply_minutes:   avg_reply,
        sla_compliance_rate: sla_total > 0 ? Math.round((total_sla_met / sla_total) * 100) : 100,
        total_sla_met,
        total_sla_breached:  total_sla_breach,
        daily,
      });

      const { data: threadsData } = await safeClient.from('email_threads', (q) =>
        q.select('sla_status')
         .eq('account_id', accountId)
         .not('sla_status', 'is', null)
      );

      const allThreads = emailMappers.threads(Array.isArray(threadsData) ? threadsData : []);
      setSlaDash({
        ok_count:       allThreads.filter(t => t.sla_status === 'ok').length,
        warning_count:  allThreads.filter(t => t.sla_status === 'warning').length,
        breached_count: allThreads.filter(t => t.sla_status === 'breached').length,
        met_count:      allThreads.filter(t => t.sla_status === 'met').length,
        total:          allThreads.length,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, days]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const chartData = (summary?.daily ?? []).map(d => ({
    date:     new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    recebidos: d.threads_received,
    respondidos: d.threads_replied,
    sla_ok:   d.sla_met_count,
    sla_falha: d.sla_breached_count,
  }));

  return {
    summary,
    slaDash,
    chartData,
    isLoading,
    error,
    refresh: loadMetrics,
  };
}
