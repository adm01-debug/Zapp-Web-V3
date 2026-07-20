import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';

export interface ConnectionRow {
  id: string;
  name: string | null;
  channel_type: string | null;
  status: string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

export function useConnectionsHealth() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminOps.realtimeMonitorConnections(),
    queryFn: async (): Promise<ConnectionRow[]> => {
      const { data, error } = await supabase
        .from('channel_connections_safe')
        .select('id,name,channel_type,status,is_active,updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConnectionRow[];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  return { data, isLoading, error };
}
