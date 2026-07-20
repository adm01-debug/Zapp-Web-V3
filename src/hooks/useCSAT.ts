import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { queryKeys } from '@/services/api/queryKeys';

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

const EMPTY_STATS: CSATStats = {
  average: 0,
  total: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  trend: 0,
};

/** Manages CSAT surveys with period-based filtering, statistics calculation, and submission. */
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
    queryKey: queryKeys.csat.surveys(period),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('csat_surveys')
        .select('*')
        .gte('created_at', getDateFilter())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CSATSurvey[]; // ignore-audit: widens agent_id from string to string|null to match local interface
    },
  });

  // Derived stats — computed synchronously from survey data to avoid stale-data
  // race conditions that occur when a separate useQuery reads sibling query data.
  const stats: CSATStats = useMemo(() => {
    const surveys = surveysQuery.data;
    if (!surveys || surveys.length === 0) return EMPTY_STATS;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    surveys.forEach((s) => {
      distribution[s.rating] = (distribution[s.rating] || 0) + 1;
      sum += s.rating;
    });

    return {
      average: sum / surveys.length,
      total: surveys.length,
      distribution,
      trend: 0,
    };
  }, [surveysQuery.data]);

  const submitSurvey = useMutation({
    mutationFn: async (data: {
      contact_id: string;
      agent_id?: string;
      rating: number;
      feedback?: string;
    }) => {
      const { error } = await supabase.from('csat_surveys').insert({
        contact_id: data.contact_id,
        agent_id: data.agent_id,
        rating: data.rating,
        feedback: data.feedback || null,
        conversation_resolved_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csat.surveysRoot() });
      toast({ title: 'Avaliação enviada!', description: 'Obrigado pelo feedback.' });
    },
    onError: () => {
      toast({ title: 'Erro ao enviar avaliação', variant: 'destructive' });
    },
  });

  return {
    surveys: surveysQuery.data || [],
    stats,
    isLoading: surveysQuery.isLoading,
    submitSurvey,
  };
}
