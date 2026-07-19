import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DateRange {
  from: Date;
  to: Date;
}

export function useQueueAnalytics(queueId: string, dateRange: DateRange | LegacyDateRange) {
  const normalizedRange: DateRange = 'startDate' in dateRange
    ? dateRange
    : { startDate: dateRange.from, endDate: dateRange.to };
  const result = useQueueAnalyticsManagement({ queueId, dateRange: normalizedRange });
  const analytics = result.analytics;
  return {
    ...result,
    dailyData: analytics
      ? [{
          date: analytics.timestamp,
          day: new Date(analytics.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          messages: analytics.total_messages,
          mensagens: analytics.total_messages,
          resolvidos: Math.round((analytics.total_messages * analytics.resolution_rate) / 100),
          novos: Math.max(0, analytics.total_messages - Math.round((analytics.total_messages * analytics.resolution_rate) / 100)),
        }]
      : [],
    hourlyData: analytics
      ? [{ hour: 'Atual', hora: 'Atual', messages: analytics.total_messages, atendimentos: analytics.total_messages }]
      : [],
    agentPerformance: [] as Array<{ name: string; atendimentos: number }>,
    statusData: analytics
      ? [
          { name: 'Resolvidas', value: analytics.resolution_rate, color: 'hsl(var(--success))' },
          { name: 'Pendentes', value: Math.max(0, 100 - analytics.resolution_rate), color: 'hsl(var(--warning))' },
        ]
      : [],
  };
}
