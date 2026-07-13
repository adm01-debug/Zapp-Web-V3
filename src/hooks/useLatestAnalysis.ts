// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useLatestAnalysisManagement } from '@/hooks/useAnalyticsManagement';

export function useLatestAnalysis(timeWindow: number) {
  return useLatestAnalysisManagement(timeWindow);
}
        .select('id, summary, status, sentiment, sentiment_score, urgency, department, customer_satisfaction, key_points, topics, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as LatestAnalysis | null; // ignore-audit: explicit select subset mapped to LatestAnalysis interface
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5,
  });
}
