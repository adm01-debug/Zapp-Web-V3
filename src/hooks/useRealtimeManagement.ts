// Consolidated Real-time & Live Update Management Module (ETAPA 37)
// Consolidates: useRealtimeDashboard, useRealtimeMessages, useRealtimeMonitor, useTypingPresence
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface RealtimeUpdate {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface RealtimeMetricPoint {
  timestamp: string;
  messagesPerMinute: number;
}

export function useRealtimeDashboardManagement(dashboardId: string) {
  const [updates, setUpdates] = useState<RealtimeUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!dashboardId) return;

    channelRef.current = supabase.channel(`dashboard:${dashboardId}`);
    channelRef.current
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'app_notifications' },
        (payload: {
          eventType: string;
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        }) => {
          setUpdates((prev) => [
            ...prev,
            {
              id: String(payload.new?.id ?? Date.now()),
              type: payload.eventType,
              data: payload.new ?? payload.old ?? {},
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      )
      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      setIsConnected(false);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [dashboardId]);

  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const messageUpdates = updates.filter(
    (update) => update.type === 'INSERT' || update.data?.type === 'message'
  );
  const messagesThisHour = messageUpdates.filter(
    (update) => Date.parse(update.timestamp) >= hourAgo
  ).length;
  const messagesLastHour = messageUpdates.filter((update) => {
    const t = Date.parse(update.timestamp);
    return t >= twoHoursAgo && t < hourAgo;
  }).length;
  const activeConversationIds = new Set(
    updates
      .filter((update) => Date.parse(update.timestamp) >= hourAgo)
      .map((update) => String(update.data?.conversation_id ?? update.data?.contact_id ?? ''))
      .filter(Boolean)
  );
  const newContactsToday = updates.filter((update) => {
    const createdAt =
      typeof update.data?.created_at === 'string' ? update.data.created_at : update.timestamp;
    return update.data?.type === 'contact' && Date.parse(createdAt) >= todayStart.getTime();
  }).length;
  const unreadMessages = updates.filter(
    (update) => update.data?.is_read === false || update.data?.read === false
  ).length;
  const lastMessage = messageUpdates.length > 0 ? messageUpdates[messageUpdates.length - 1] : null;
  const lastMessageAt = lastMessage ? new Date(lastMessage.timestamp) : null;
  const metricsHistory: RealtimeMetricPoint[] = updates.slice(-30).map((update, index) => ({
    timestamp: update.timestamp,
    messagesPerMinute: Math.max(
      0,
      index === 0 ? messagesThisHour : Math.round(messagesThisHour / Math.max(1, index))
    ),
  }));

  return {
    updates,
    messagesThisHour,
    messagesLastHour,
    messagesPerMinute: Math.round(messagesThisHour / 60),
    activeConversationsNow: activeConversationIds.size,
    newContactsToday,
    unreadMessages,
    metricsHistory,
    lastMessageAt,
    isConnected,
  };
}

type RealtimeChannel = ReturnType<typeof supabase.channel>;
type PgPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export function useRealtimeMessagesManagement(chatId: string) {
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!chatId) return;

    channelRef.current = supabase.channel(`chat:${chatId}`);
    channelRef.current
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo',
          table: 'evolution_messages',
          filter: `remote_jid=eq.${chatId}`,
        },
        (payload: PgPayload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [chatId]);

  return { messages };
}

export function useRealtimeMonitorManagement(tableName: string) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [changes, setChanges] = useState<PgPayload[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    channelRef.current = supabase.channel(`monitor:${tableName}`);
    channelRef.current
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: tableName },
        (payload: PgPayload) => {
          setChanges((prev) => [...prev, payload]);
          if (payload.eventType === 'INSERT') {
            setData((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'DELETE') {
            setData((prev) => prev.filter((item) => item.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setData((prev) =>
              prev.map((item) => (item.id === payload.new.id ? payload.new : item))
            );
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tableName]);

  return { data, changes };
}

export function useTypingPresenceManagement(userId: string, chatId: string) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!userId || !chatId) return;

    channelRef.current = supabase.channel(`typing:${chatId}`);
    channelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = channelRef.current.presenceState() as Record<string, Array<{ typing?: boolean }>>;
        const users = (Object.entries(state) as Array<[string, Array<{ typing?: boolean }>]>)
          .filter(([, presence]) => Boolean(presence?.[0]?.typing))
          .map(([key]) => key);
        setTypingUsers(users);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channelRef.current.track({ typing: true });
        }
      });

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, chatId]);

  const startTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channelRef.current?.track({ typing: false });
    }, 3000);
  }, []);

  return { typingUsers, startTyping };
}

export type { RealtimeUpdate };
