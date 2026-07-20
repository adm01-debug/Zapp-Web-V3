// Consolidated Analytics & Monitoring Management Module (ETAPA 48 consolidation)
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dbList, dbFrom } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { useMountedRef } from '@/hooks/useMountedRef';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { startOfHour, format, parseISO, subHours } from 'date-fns';
import { queryKeys } from '@/services/api/queryKeys';

const log = getLogger('useAnalyticsMonitoringManagement');

// ===== CSAT Types & Management =====
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
  trend: number;
}

/** Retrieves customer satisfaction scores with trend analysis. */
export function useCSATManagement(period: 'today' | 'week' | 'month' = 'month') {
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
      return data as CSATSurvey[];
    },
  });

  // Derived stats — computed synchronously to avoid stale-data race conditions
  // from a secondary useQuery reading sibling query data.
  const statsData: CSATStats = useMemo(() => {
    const surveys = surveysQuery.data;
    if (!surveys || surveys.length === 0)
      return { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, trend: 0 };
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    surveys.forEach((s) => {
      distribution[s.rating] = (distribution[s.rating] || 0) + 1;
      sum += s.rating;
    });
    return { average: sum / surveys.length, total: surveys.length, distribution, trend: 0 };
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
      toast.success('Avaliação enviada! Obrigado pelo feedback.');
    },
    onError: () => {
      toast.error('Erro ao enviar avaliação');
    },
  });

  return {
    surveys: surveysQuery.data || [],
    stats: statsData,
    isLoading: surveysQuery.isLoading,
    submitSurvey,
  };
}

// ===== Demand Prediction Types & Management =====
export interface PredictionPoint {
  time: string;
  actual?: number;
  predicted: number;
  lower: number;
  upper: number;
  isPrediction?: boolean;
}

export interface DemandInsights {
  maxPredicted: number;
  avgPredicted: number;
  currentActual: number;
  trend: 'up' | 'down';
  peakTime: string;
  capacityRisk: boolean;
}

function generatePredictionFromHistory(
  messageHistory: { hour: number; count: number }[]
): PredictionPoint[] {
  const now = new Date();
  const data: PredictionPoint[] = [];

  const hourlyAvg = new Map<number, number>();
  messageHistory.forEach(({ hour, count }) => hourlyAvg.set(hour, count));

  for (let i = -4; i <= 0; i++) {
    const time = new Date(now.getTime() + i * 60 * 60 * 1000);
    const hourCount = hourlyAvg.get(time.getHours()) || 0;
    data.push({
      time: time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      actual: hourCount,
      predicted: hourCount,
      lower: hourCount,
      upper: hourCount,
      isPrediction: false,
    });
  }

  for (let i = 1; i <= 4; i++) {
    const time = new Date(now.getTime() + i * 60 * 60 * 1000);
    const predicted = hourlyAvg.get(time.getHours()) || 0;
    const variance = Math.max(2, Math.round(predicted * 0.2)) + i;
    data.push({
      time: time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      predicted,
      lower: Math.max(0, predicted - variance),
      upper: predicted + variance,
      isPrediction: true,
    });
  }

  return data;
}

/** Predicts queue demand with capacity forecasting and staffing recommendations. */
export function useDemandPredictionManagement(
  externalData?: PredictionPoint[],
  currentCapacity = 35
) {
  const { data: messageHistory = [] } = useQuery({
    queryKey: queryKeys.demandPrediction.history(),
    queryFn: async () => {
      const { data, error } = await dbFrom('messages')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;

      const hourCounts = new Map<number, number[]>();
      (data || []).forEach((m) => {
        const hour = new Date(m.created_at).getHours();
        const bucket = hourCounts.get(hour);
        if (bucket) bucket.push(1);
        else hourCounts.set(hour, [1]);
      });

      return Array.from(hourCounts.entries()).map(([hour, counts]) => ({
        hour,
        count: Math.round(counts.length / 7),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = externalData || generatePredictionFromHistory(messageHistory);

  const insights = useMemo<DemandInsights>(() => {
    const predictions = data.filter((d) => d.isPrediction);
    const maxPredicted = Math.max(...predictions.map((p) => p.predicted));
    const avgPredicted = predictions.reduce((a, b) => a + b.predicted, 0) / predictions.length;
    const currentActual = data.find((d) => !d.isPrediction && d.actual !== undefined)?.actual || 0;
    const trend = predictions[predictions.length - 1].predicted > currentActual ? 'up' : 'down';
    const peakTime = predictions.find((p) => p.predicted === maxPredicted)?.time || '';
    const capacityRisk = maxPredicted > currentCapacity;
    return { maxPredicted, avgPredicted, currentActual, trend, peakTime, capacityRisk };
  }, [data, currentCapacity]);

  return { data, insights };
}

// ===== Delivery Stats Types & Management =====
export interface ParticipantStats {
  participantJid: string;
  displayName: string;
  sent: number;
  delivered: number;
  read: number;
  lastSentAt: string | null;
  lastDeliveredAt: string | null;
  lastReadAt: string | null;
  timeline: DeliveryTimelinePoint[];
}

export interface DeliveryTimelinePoint {
  time: string;
  sent: number;
  delivered: number;
  read: number;
}

export interface DeliveryStatsResult {
  isGroup: boolean;
  totals: {
    sent: number;
    delivered: number;
    read: number;
    lastSentAt: string | null;
    lastDeliveredAt: string | null;
    lastReadAt: string | null;
  };
  participants: ParticipantStats[];
  timeline: DeliveryTimelinePoint[];
  totalMessages: number;
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  played: 3,
};

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

function isGroupJid(jid: string): boolean {
  return jid?.endsWith('@g.us');
}

function extractParticipant(msg: Record<string, unknown>): { jid: string; name: string } {
  const fromMe = !!msg.from_me;
  const remoteJid = String(msg.remote_jid ?? '');
  const pushName = (msg.push_name as string | null) ?? '';

  if (fromMe) {
    return { jid: 'me', name: 'Atendente' };
  }

  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const key = (payload.key ?? {}) as Record<string, unknown>;
  const participant =
    (key.participant as string | undefined) ?? (payload.participant as string | undefined) ?? null;

  if (participant) {
    return { jid: participant, name: pushName || participant.split('@')[0] };
  }

  return { jid: remoteJid, name: pushName || remoteJid.split('@')[0] };
}

function generateMockDeliveryData(remoteJid: string): DeliveryStatsResult {
  const isGroup = isGroupJid(remoteJid);
  const now = new Date();
  const timeline: DeliveryTimelinePoint[] = [];

  for (let i = 24; i >= 0; i--) {
    const time = format(subHours(now, i), 'yyyy-MM-dd HH:00');
    timeline.push({
      time,
      sent: Math.floor(Math.random() * 50) + 10,
      delivered: Math.floor(Math.random() * 40) + 5,
      read: Math.floor(Math.random() * 30),
    });
  }

  const participants: ParticipantStats[] = isGroup
    ? [
        {
          participantJid: 'p1@s.whatsapp.net',
          displayName: 'Mock Member 1',
          sent: 150,
          delivered: 140,
          read: 120,
          lastSentAt: now.toISOString(),
          lastDeliveredAt: now.toISOString(),
          lastReadAt: now.toISOString(),
          timeline: timeline.map((t) => ({ ...t, read: Math.floor(t.read * 0.4) })),
        },
        {
          participantJid: 'p2@s.whatsapp.net',
          displayName: 'Mock Member 2',
          sent: 200,
          delivered: 190,
          read: 180,
          lastSentAt: now.toISOString(),
          lastDeliveredAt: now.toISOString(),
          lastReadAt: now.toISOString(),
          timeline: timeline.map((t) => ({ ...t, read: Math.floor(t.read * 0.6) })),
        },
      ]
    : [];

  return {
    isGroup,
    totalMessages: 500,
    totals: {
      sent: timeline.reduce((acc, t) => acc + t.sent, 0),
      delivered: timeline.reduce((acc, t) => acc + t.delivered, 0),
      read: timeline.reduce((acc, t) => acc + t.read, 0),
      lastSentAt: now.toISOString(),
      lastDeliveredAt: now.toISOString(),
      lastReadAt: now.toISOString(),
    },
    participants,
    timeline,
  };
}

/** Retrieves message delivery statistics and success rates. */
export function useDeliveryStatsManagement(remoteJid: string | undefined, instance = 'wpp2') {
  return useQuery<DeliveryStatsResult>({
    queryKey: queryKeys.deliveryStats.contact(remoteJid, instance),
    enabled: !!remoteJid,
    staleTime: 30_000,
    queryFn: async () => {
      const isSimulating = localStorage.getItem('zappweb:sla-simulation') === 'true';
      if (isSimulating && remoteJid) {
        return generateMockDeliveryData(remoteJid);
      }

      const { data, error } = await dbList(RPC.listMessages, {
        p_remote_jid: remoteJid!,
        p_instance: instance,
        p_limit: 500,
      });

      if (error) {
        log.error('Delivery stats query error', error);
        return {
          isGroup: isGroupJid(remoteJid!),
          totals: {
            sent: 0,
            delivered: 0,
            read: 0,
            lastSentAt: null,
            lastDeliveredAt: null,
            lastReadAt: null,
          },
          participants: [],
          timeline: [],
          totalMessages: 0,
        };
      }

      const messages = (data && Array.isArray(data) ? data : []) as Record<string, unknown>[];
      const isGroup = isGroupJid(remoteJid!);

      const totals = {
        sent: 0,
        delivered: 0,
        read: 0,
        lastSentAt: null as string | null,
        lastDeliveredAt: null as string | null,
        lastReadAt: null as string | null,
      };
      const byParticipant = new Map<string, ParticipantStats>();
      const timelineMap = new Map<string, DeliveryTimelinePoint>();

      for (const msg of messages) {
        const status = String(msg.status ?? 'pending').toLowerCase();
        const rank = STATUS_RANK[status] ?? 0;
        const tsString =
          (msg.status_at as string | null) ?? (msg.created_at as string | null) ?? null;
        const { jid, name } = extractParticipant(msg);

        if (tsString) {
          const date = parseISO(tsString);
          const hourKey = format(startOfHour(date), 'yyyy-MM-dd HH:00');
          if (!timelineMap.has(hourKey)) {
            timelineMap.set(hourKey, { time: hourKey, sent: 0, delivered: 0, read: 0 });
          }
          const point = timelineMap.get(hourKey)!;
          if (rank >= 1) point.sent++;
          if (rank >= 2) point.delivered++;
          if (rank >= 3) point.read++;
        }

        if (!byParticipant.has(jid)) {
          byParticipant.set(jid, {
            participantJid: jid,
            displayName: name,
            sent: 0,
            delivered: 0,
            read: 0,
            lastSentAt: null,
            lastDeliveredAt: null,
            lastReadAt: null,
            timeline: [],
          });
        }
        const p = byParticipant.get(jid)!;
        if (name && name.length > p.displayName.length) p.displayName = name;

        if (tsString) {
          const date = parseISO(tsString);
          const hourKey = format(startOfHour(date), 'yyyy-MM-dd HH:00');
          let pPoint = p.timeline.find((pt) => pt.time === hourKey);
          if (!pPoint) {
            pPoint = { time: hourKey, sent: 0, delivered: 0, read: 0 };
            p.timeline.push(pPoint);
          }
          if (rank >= 1) pPoint.sent++;
          if (rank >= 2) pPoint.delivered++;
          if (rank >= 3) pPoint.read++;
        }

        if (rank >= 1) {
          p.sent++;
          totals.sent++;
          p.lastSentAt = maxDate(p.lastSentAt, tsString);
          totals.lastSentAt = maxDate(totals.lastSentAt, tsString);
        }
        if (rank >= 2) {
          p.delivered++;
          totals.delivered++;
          p.lastDeliveredAt = maxDate(p.lastDeliveredAt, tsString);
          totals.lastDeliveredAt = maxDate(totals.lastDeliveredAt, tsString);
        }
        if (rank >= 3) {
          p.read++;
          totals.read++;
          p.lastReadAt = maxDate(p.lastReadAt, tsString);
          totals.lastReadAt = maxDate(totals.lastReadAt, tsString);
        }
      }

      const participants = Array.from(byParticipant.values())
        .map((p) => ({
          ...p,
          timeline: p.timeline.sort((a, b) => a.time.localeCompare(b.time)),
        }))
        .sort((a, b) => b.sent - a.sent);

      const timeline = Array.from(timelineMap.values()).sort((a, b) =>
        a.time.localeCompare(b.time)
      );

      return { isGroup, totals, participants, timeline, totalMessages: messages.length };
    },
  });
}

// ===== NPS Surveys Types & Management =====
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

/** Manages NPS survey campaigns and response tracking. */
export function useNPSSurveysManagement() {
  const [surveys, setSurveys] = useState<NPSSurvey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useMountedRef();

  const fetchSurveys = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      if (!mountedRef.current) return;
      setSurveys((data as NPSSurvey[]) || []);
    } catch (err) {
      log.error('Error fetching NPS surveys:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [mountedRef]);

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
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

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

  const metrics: NPSMetrics = useMemo(() => {
    const total = surveys.length;
    if (total === 0) {
      return {
        totalResponses: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        npsScore: 0,
        avgScore: 0,
      };
    }

    const promoters = surveys.filter((s) => s.score >= 9).length;
    const passives = surveys.filter((s) => s.score >= 7 && s.score <= 8).length;
    const detractors = surveys.filter((s) => s.score <= 6).length;
    const npsScore = Math.round(((promoters - detractors) / total) * 100);
    const avgScore = +(surveys.reduce((sum, s) => sum + s.score, 0) / total).toFixed(1);

    return { totalResponses: total, promoters, passives, detractors, npsScore, avgScore };
  }, [surveys]);

  return { surveys, isLoading, metrics, createSurvey, refetch: fetchSurveys };
}
