import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';

export interface UsageLog {
  id: string;
  function_name: string;
  model: string | null;
  status: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function useAIProviderHealth() {
  return useQuery<UsageLog[]>({
    queryKey: queryKeys.aiFeatures.providerHealth(),
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .eq('function_name', 'ai-proxy')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as UsageLog[];
    },
  });
}
