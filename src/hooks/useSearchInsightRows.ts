import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';

export interface SearchInsightRow {
  id: string;
  search_term: string;
  search_count: number;
  click_count: number;
}

export function useSearchInsightRows() {
  const { data: insights = [], isLoading } = useQuery<SearchInsightRow[]>({
    queryKey: queryKeys.adminOps.searchInsights(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('search_insights')
        .select('*')
        .order('search_count', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SearchInsightRow[];
    },
  });

  return { insights, isLoading };
}
