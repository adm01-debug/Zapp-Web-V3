import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { startOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';

export type PeriodFilter = 'today' | 'week' | 'month' | 'all';

interface SLAMetric {
  total: number;
  onTime: number;
  breached: number;
  rate: number;
}

interface AgentSLAMetric {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  firstResponse: SLAMetric;
  resolution: SLAMetric;
  overallRate: number;
}

export interface SLADashboardData {
  overall: {
    firstResponse: SLAMetric;
    resolution: SLAMetric;
    totalConversations: number;
    overallRate: number;
  };
  byAgent: AgentSLAMetric[];
}

function getStartDate(period: PeriodFilter): Date {
  const now = new Date();
  switch (period) {
    case 'today':
      return startOfDay(now);
    case 'week':
      return startOfWeek(now, { weekStartsOn: 1 });
    case 'month':
      return startOfMonth(now);
    case 'all':
      return subDays(now, 365);
  }
}

interface SLARow {
  first_response_at: string | null;
  first_response_breached: boolean | null;
  resolved_at: string | null;
  resolution_breached: boolean | null;
  contacts: { assigned_to: string | null } | null;
}

function buildMetric(onTime: number, breached: number): SLAMetric {
  const total = onTime + breached;
  return { total, onTime, breached, rate: total > 0 ? (onTime / total) * 100 : 100 };
}

async function fetchSLAMetrics(period: PeriodFilter): Promise<SLADashboardData> {
  const startDate = getStartDate(period).toISOString();

  const [slaResult, profilesResult] = await Promise.all([
    safeClient.from('conversation_sla', (q) =>
      q.select('*, contacts!inner(assigned_to)').gte('created_at', startDate)
    ),
    supabase.from('profiles').select('id, name, avatar_url'),
  ]);

  if (slaResult.error) throw slaResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const slaData = (slaResult.data || []) as SLARow[];
  const profiles = (profilesResult.data || []) as {
    id: string;
    name: string;
    avatar_url: string | null;
  }[];

  // Overall
  const frOnTime = slaData.filter((s) => s.first_response_at && !s.first_response_breached).length;
  const frBreached = slaData.filter((s) => s.first_response_breached).length;
  const resOnTime = slaData.filter((s) => s.resolved_at && !s.resolution_breached).length;
  const resBreached = slaData.filter((s) => s.resolution_breached).length;

  const firstResponse = buildMetric(frOnTime, frBreached);
  const resolution = buildMetric(resOnTime, resBreached);
  const totalConversations = slaData.length;
  const combinedTotal = firstResponse.total + resolution.total;

  const overall = {
    firstResponse,
    resolution,
    totalConversations,
    overallRate: combinedTotal > 0 ? ((frOnTime + resOnTime) / combinedTotal) * 100 : 100,
  };

  // By agent
  const agentMap = new Map<string, { frOn: number; frBr: number; resOn: number; resBr: number }>();

  for (const sla of slaData) {
    const agentId = sla.contacts?.assigned_to;
    if (!agentId) continue;

    const stats = agentMap.get(agentId) || { frOn: 0, frBr: 0, resOn: 0, resBr: 0 };
    if (sla.first_response_at && !sla.first_response_breached) stats.frOn++;
    if (sla.first_response_breached) stats.frBr++;
    if (sla.resolved_at && !sla.resolution_breached) stats.resOn++;
    if (sla.resolution_breached) stats.resBr++;
    agentMap.set(agentId, stats);
  }

  const byAgent: AgentSLAMetric[] = Array.from(agentMap.entries())
    .map(([agentId, s]) => {
      const profile = profiles.find((p) => p.id === agentId);
      const fr = buildMetric(s.frOn, s.frBr);
      const res = buildMetric(s.resOn, s.resBr);
      const total = fr.total + res.total;
      return {
        agentId,
        agentName: profile?.name || 'Agente',
        avatarUrl: profile?.avatar_url || undefined,
        firstResponse: fr,
        resolution: res,
        overallRate: total > 0 ? ((s.frOn + s.resOn) / total) * 100 : 100,
      };
    })
    .sort((a, b) => b.overallRate - a.overallRate);

  return { overall, byAgent };
}

export const useSLAMetrics = (period: PeriodFilter = 'today') => {
  const { data = null, isLoading: loading } = useQuery({
    queryKey: queryKeys.sla.metrics(period),
    queryFn: () => fetchSLAMetrics(period),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { data, loading };
};
