// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { usePerformanceMonitoringManagement } from '@/hooks/useAnalyticsManagement';

export function usePerformanceMetrics(componentName: string) {
  return usePerformanceMonitoringManagement();
    const now = performance.now();
    const duration = now - lastRenderTime.current;
    renderCount.current++;

    if (duration > 16.67) { // Missed a frame (60fps)
      log.warn(`[${componentName}] Long task detected: ${duration.toFixed(2)}ms (Render #${renderCount.current})`);
    }

    lastRenderTime.current = now;
  });

  useEffect(() => {
    // LCP (Largest Contentful Paint)
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        log.info(`[${componentName}] LCP: ${entry.startTime.toFixed(2)}ms`, entry);
      });
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // INP (Interaction to Next Paint)
    const inpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.duration > 0) {
          log.info(`[${componentName}] INP candidate: ${entry.duration.toFixed(2)}ms`, entry);
        }
      });
    });
    inpObserver.observe({ type: 'event-timing', buffered: true, durationThreshold: 40 } as PerformanceObserverInit & { durationThreshold?: number });

    // CLS (Cumulative Layout Shift)
    const clsObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) {
          log.warn(`[${componentName}] Layout Shift: ${(shift.value ?? 0).toFixed(4)}`, entry);
        }
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    return () => {
      lcpObserver.disconnect();
      inpObserver.disconnect();
      clsObserver.disconnect();
    };
  }, [componentName]);
}

// ──────────────────────────────────────────────────────────────────────────
// HISTORICAL SNAPSHOTS
// ──────────────────────────────────────────────────────────────────────────

export interface PerformanceSnapshot {
  id: string;
  profile_id: string;
  fcp: number;
  page_load: number;
  dom_ready: number;
  ttfb: number;
  memory_used: number;
  memory_total: number;
  dom_nodes: number;
  network_type: string;
  rtt: number;
  overall_score: number;
  user_agent: string | null;
  created_at: string;
}

/**
 * Hook for capturing and storing performance snapshots to database.
 * Allows historical performance analysis and trend tracking.
 */
export function usePerformanceSnapshots() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const saveSnapshot = useCallback(
    async (data: {
      fcp: number;
      page_load: number;
      dom_ready: number;
      ttfb: number;
      memory_used: number;
      memory_total: number;
      dom_nodes: number;
      network_type: string;
      rtt: number;
      overall_score: number;
    }) => {
      if (!profile?.id) return;

      try {
        await supabase.from('performance_snapshots').insert({
          profile_id: profile.id,
          ...data,
          user_agent: navigator.userAgent,
        } as unknown as Database['public']['Tables']['performance_snapshots']['Insert']);
      } catch (err) {
        log.warn('Failed to save performance snapshot:', err);
      }
    },
    [profile?.id]
  );

  const loadHistory = useCallback(async (hours = 24) => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('performance_snapshots')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw error;
      setHistory((data || []) as PerformanceSnapshot[]);
    } catch (err) {
      log.warn('Failed to load performance history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearOldSnapshots = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('performance_snapshots').delete().lt('created_at', sevenDaysAgo);
      toast.success('Dados antigos removidos');
      await loadHistory();
    } catch {
      toast.error('Erro ao limpar dados');
    }
  }, [loadHistory]);

  return {
    history,
    loading,
    saveSnapshot,
    loadHistory,
    clearOldSnapshots,
  };
}

export default {
  usePerformanceMetrics,
  usePerformanceSnapshots,
};
