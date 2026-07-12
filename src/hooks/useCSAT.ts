import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface CSATSurvey {
  id: string;
  contact_id: string;
  agent_id: string | null;
  rating: number;
  feedback: string | null;
  conversation_resolved_at: string | null;
  created_at: string;
}

export interface CSATStats {
  average: number;
  total: number;
  distribution: Record<number, number>;
  trend: number; // percentage change vs previous period
}

export function useCSAT(period: 'today' | 'week' | 'month' = 'month') {
  const queryClient = useQueryClient();

  const getDateFilter = () => {
    const now = new Date();
    switch (period) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo.toISOString();
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo.toISOString();
      }
    }
  };

  const surveysQuery = useQuery({
    queryKey: ['csat-surveys', period],
    queryFn: async () => {
      // Fetch only the most recent 200 rows for display purposes — full stats
      // come from the server-side RPC below which aggregates without any row cap.
      const { data, error } = await supabase
        .from('csat_surveys')
        .select('*')
        .gte('created_at', getDateFilter())
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data as CSATSurvey[];
    },
  });

  const statsQuery = useQuery({
    queryKey: ['csat-stats', period],
    queryFn: async () => {
      // Server-side aggregation via RPC: correct totals even when survey count
      // exceeds what PostgREST would return row-by-row.
      const { data, error } = await supabase.rpc('get_csat_stats', {
        start_date: getDateFilter(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.total) {
        return { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, trend: 0 } as CSATStats;
      }
      return {
        average: Number(row.average ?? 0),
        total: Number(row.total),
        distribution: {
          1: Number(row.rating_1),
          2: Number(row.rating_2),
          3: Number(row.rating_3),
          4: Number(row.rating_4),
          5: Number(row.rating_5),
        },
        trend: 0,
      } as CSATStats;
    },
  });

  const submitSurvey = useMutation({
    mutationFn: async (data: { contact_id: string; agent_id?: string; rating: number; feedback?: string }) => {
      const { error } = await supabase.from('csat_surveys').insert({
        contact_id: data.contact_id,
        ...(data.agent_id ? { agent_id: data.agent_id } : {}),
        rating: data.rating,
        feedback: data.feedback || null,
        conversation_resolved_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csat-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['csat-stats'] });
      toast({ title: 'Avaliação enviada!', description: 'Obrigado pelo feedback.' });
    },
    onError: () => {
      toast({ title: 'Erro ao enviar avaliação', variant: 'destructive' });
    },
  });

  return {
    surveys: surveysQuery.data || [],
    stats: statsQuery.data,
    isLoading: surveysQuery.isLoading,
    submitSurvey,
  };
}
