import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FailedAuthRow {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  attempt_count: number;
  last_attempt_at: string;
  locked_until: string | null;
  created_at: string;
}

interface UseFailedAuthMessagesOptions {
  from: Date | undefined;
  to: Date | undefined;
}

export function useFailedAuthMessages({ from, to }: UseFailedAuthMessagesOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ['failed-auth', from?.toISOString() ?? null, to?.toISOString() ?? null] as const;

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let query = supabase
        .from('login_attempts')
        .select('*')
        .order('last_attempt_at', { ascending: false })
        .limit(500);

      if (from) {
        const start = new Date(from);
        start.setHours(0, 0, 0, 0);
        query = query.gte('last_attempt_at', start.toISOString());
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        query = query.lte('last_attempt_at', end.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        toast({ title: 'Erro ao carregar falhas', description: error.message, variant: 'destructive' });
        return [] as FailedAuthRow[];
      }
      return (data ?? []) as FailedAuthRow[];
    },
    staleTime: 30_000,
  });

  return { rows, loading, load: () => queryClient.invalidateQueries({ queryKey: key }) };
}
