import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';

export interface SearchInsightsTopQuery {
  query: string;
  count: number;
  avg_results: number;
}

export interface SearchInsightsZeroResult {
  query: string;
  count: number;
  last_at: string;
}

export interface SearchInsights {
  total_searches: number;
  unique_queries: number;
  vector_searches: number;
  vector_share: number; // 0..1
  total_clicks: number;
  click_through_rate: number; // 0..1
  zero_result_count: number;
  zero_result_rate: number; // 0..1
  avg_result_count: number;
  top_queries: SearchInsightsTopQuery[];
  zero_result_queries: SearchInsightsZeroResult[];
  window_days: number;
}

const EMPTY: SearchInsights = {
  total_searches: 0, unique_queries: 0, vector_searches: 0, vector_share: 0,
  total_clicks: 0, click_through_rate: 0, zero_result_count: 0, zero_result_rate: 0,
  avg_result_count: 0, top_queries: [], zero_result_queries: [], window_days: 7,
};

export function useSearchInsights(days: number) {
  return useQuery<SearchInsights>({
    queryKey: ['search-insights', days],
    queryFn: async () => {
      const { data, error } = await safeClient.rpc<SearchInsights>('rpc_search_insights', { p_days: days });
      if (error) throw error;
      if (!data || typeof data !== 'object') return { ...EMPTY, window_days: days };
      return { ...EMPTY, ...(data as Partial<SearchInsights>), window_days: days };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}