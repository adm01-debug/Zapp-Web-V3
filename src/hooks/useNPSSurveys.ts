import { useState, useEffect, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('NPSSurveys');
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NPSSurvey {
  id: string;
  contact_id: string;
  agent_id: string | null;
  score: number;
  feedback: string | null;
  survey_type: 'periodic' | 'post_resolution' | 'manual';
  created_at: string;
}

interface NPSMetrics {
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
  avgScore: number;
}

const EMPTY_METRICS: NPSMetrics = {
  totalResponses: 0,
  promoters: 0,
  passives: 0,
  detractors: 0,
  npsScore: 0,
  avgScore: 0,
};

export function useNPSSurveys() {
  // surveys holds only the 10 most recent entries — display list only.
  // Aggregate metrics come from the get_nps_stats RPC to avoid O(N) pagination.
  const [surveys, setSurveys] = useState<NPSSurvey[]>([]);
  const [metrics, setMetrics] = useState<NPSMetrics>(EMPTY_METRICS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSurveys = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsResult, recentResult] = await Promise.all([
        supabase.rpc('get_nps_stats'),
        supabase
          .from('nps_surveys')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(10),
      ]);

      if (statsResult.error) throw statsResult.error;
      if (recentResult.error) throw recentResult.error;

      interface RawStats {
        total_responses: number | string;
        promoters: number | string;
        passives: number | string;
        detractors: number | string;
        nps_score: number | string;
        avg_score: number | string;
      }
      const stats = (statsResult.data as unknown as RawStats[] | null)?.[0];
      if (stats) {
        setMetrics({
          totalResponses: Number(stats.total_responses),
          promoters: Number(stats.promoters),
          passives: Number(stats.passives),
          detractors: Number(stats.detractors),
          npsScore: Number(stats.nps_score),
          avgScore: Number(stats.avg_score),
        });
      }
      setSurveys((recentResult.data as NPSSurvey[]) ?? []);
    } catch (err) {
      log.error('Error fetching NPS surveys:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  const createSurvey = useCallback(
    async (data: {
      contact_id: string;
      score: number;
      feedback?: string;
      survey_type?: string;
    }) => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
          .single();

        const { error } = await supabase.from('nps_surveys').insert({
          contact_id: data.contact_id,
          agent_id: profile?.id || null,
          score: data.score,
          feedback: data.feedback || null,
          survey_type: data.survey_type || 'manual',
        });

        if (error) throw error;
        toast.success('Pesquisa NPS registrada!');
        await fetchSurveys();
      } catch (err) {
        toast.error('Erro ao registrar pesquisa NPS');
        throw err;
      }
    },
    [fetchSurveys]
  );

  return { surveys, isLoading, metrics, createSurvey, refetch: fetchSurveys };
}
