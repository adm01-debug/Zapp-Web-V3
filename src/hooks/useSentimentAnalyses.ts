import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { format, subDays } from 'date-fns';

export interface SentimentData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  avg_score: number;
  alerts_count: number;
}

export function useRealSentimentData(days: number): SentimentData[] | null {
  const { data } = useQuery<SentimentData[] | null>({
    queryKey: queryKeys.adminOps.sentimentTrend(days),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const startDate = subDays(new Date(), days);
      const { data: analyses, error } = await supabase
        .from('conversation_analyses')
        .select('created_at, sentiment, sentiment_score')
        .gte('created_at', startDate.toISOString())
        .order('created_at');
      if (error) throw error;
      if (!analyses || analyses.length === 0) return null;

      const dayMap = new Map<
        string,
        { positive: number; negative: number; neutral: number; total: number; alerts: number }
      >();

      analyses.forEach((a) => {
        const dateKey = format(new Date(a.created_at), 'yyyy-MM-dd');
        if (!dayMap.has(dateKey))
          dayMap.set(dateKey, { positive: 0, negative: 0, neutral: 0, total: 0, alerts: 0 });
        const entry = dayMap.get(dateKey)!;
        entry.total++;
        if (a.sentiment === 'positivo') entry.positive++;
        else if (a.sentiment === 'negativo') {
          entry.negative++;
          entry.alerts++;
        } else entry.neutral++;
      });

      return Array.from(dayMap.entries()).map(([date, counts]) => ({
        date,
        positive: Math.round((counts.positive / counts.total) * 100),
        neutral: Math.round((counts.neutral / counts.total) * 100),
        negative: Math.round((counts.negative / counts.total) * 100),
        avg_score: (counts.positive - counts.negative) / counts.total,
        alerts_count: counts.alerts,
      }));
    },
  });

  return data ?? null;
}
