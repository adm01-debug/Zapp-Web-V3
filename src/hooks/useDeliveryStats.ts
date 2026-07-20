import { useQuery } from '@tanstack/react-query';
import { dbList } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { queryKeys } from '@/services/api/queryKeys';
import { startOfHour, format, parseISO, subHours } from 'date-fns';
import { getLogger } from '@/lib/logger';

const log = getLogger('useDeliveryStats');

/** Participant Stats interface definition. */
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

/** Delivery Timeline Point interface definition. */
export interface DeliveryTimelinePoint {
  time: string;
  sent: number;
  delivered: number;
  read: number;
}

/** Delivery Stats Result interface definition. */
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

/** Returns the later of two nullable ISO timestamp strings; returns the non-null side when one argument is null. */
function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

/** Returns true when the JID string belongs to a WhatsApp group (ends with `@g.us`). */
function isGroupJid(jid: string): boolean {
  return jid?.endsWith('@g.us');
}

/** Extracts participant JID and display name from a raw message row, handling group participant nesting inside `payload.key.participant`. Returns `{ jid: 'me', name: 'Atendente' }` for outbound messages. */
function extractParticipant(msg: Record<string, unknown>): { jid: string; name: string } {
  const fromMe = !!msg.from_me;
  const remoteJid = String(msg.remote_jid ?? '');
  const pushName = (msg.push_name as string | null) ?? '';

  if (fromMe) {
    return { jid: 'me', name: 'Atendente' };
  }

  // For groups, participant JID lives in payload.key.participant or payload.participant
  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const key = (payload.key ?? {}) as Record<string, unknown>;
  const participant =
    (key.participant as string | undefined) ?? (payload.participant as string | undefined) ?? null;

  if (participant) {
    return { jid: participant, name: pushName || participant.split('@')[0] };
  }

  // 1-1 chat: participant is the remote contact
  return { jid: remoteJid, name: pushName || remoteJid.split('@')[0] };
}

// SIMULATION DATA GENERATOR
/** Generates synthetic 24-hour delivery timeline and fake participant stats for the given JID; used in development and demo environments. */
function generateMockData(remoteJid: string): DeliveryStatsResult {
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
export function useDeliveryStats(remoteJid: string | undefined, instance = 'wpp2') {
  return useQuery<DeliveryStatsResult>({
    queryKey: queryKeys.deliveryStats.contact(remoteJid, instance),
    enabled: !!remoteJid,
    staleTime: 30_000,
    queryFn: async () => {
      // Check for simulation mode via localStorage
      const isSimulating = localStorage.getItem('zappweb:sla-simulation') === 'true';
      if (isSimulating && remoteJid) {
        return generateMockData(remoteJid);
      }

      const { data, error } = await dbList(RPC.listMessages, {
        p_remote_jid: remoteJid ?? '',
        p_instance: instance,
        p_limit: 500,
      });

      // Fallback para quando o retorno do Supabase vier em formato inesperado
      if (error) {
        log.error('Delivery stats query error', error);
        return {
          isGroup: isGroupJid(remoteJid ?? ''),
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
      const isGroup = isGroupJid(remoteJid ?? '');

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

        // Timeline aggregation (by hour)
        if (tsString) {
          const date = parseISO(tsString);
          const hourKey = format(startOfHour(date), 'yyyy-MM-dd HH:00');
          if (!timelineMap.has(hourKey)) {
            timelineMap.set(hourKey, { time: hourKey, sent: 0, delivered: 0, read: 0 });
          }
          const point = timelineMap.get(hourKey) as DeliveryTimelinePoint;
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
            timeline: [], // Initial state for participant timeline
          });
        }
        const p = byParticipant.get(jid) as ParticipantStats;
        if (name && name.length > p.displayName.length) p.displayName = name;

        // Participant timeline aggregation
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
