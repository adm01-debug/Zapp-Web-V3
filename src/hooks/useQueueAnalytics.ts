// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueAnalyticsManagement } from '@/hooks/useQueueManagement';
import type { DateRange } from '@/hooks/useQueueManagement';

export type { DateRange };

interface LegacyDateRange {
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
    dailyData: analytics ? [{ date: analytics.timestamp, messages: analytics.total_messages }] : [],
    hourlyData: analytics ? [{ hour: 'Atual', messages: analytics.total_messages }] : [],
    agentPerformance: [],
    statusData: analytics
      ? [
          { name: 'Resolvidas', value: analytics.resolution_rate, color: 'hsl(var(--success))' },
          { name: 'Pendentes', value: Math.max(0, 100 - analytics.resolution_rate), color: 'hsl(var(--warning))' },
        ]
      : [],
  };
}
