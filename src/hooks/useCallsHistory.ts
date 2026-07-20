import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';

export interface Call {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  direction: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
}

export function useCallsHistory() {
  return useQuery<Call[]>({
    queryKey: queryKeys.calls.history(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Call[];
    },
  });
}
