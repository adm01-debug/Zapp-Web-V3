// Consolidated Real-time & Live Update Management Module (ETAPA 37)
// Consolidates: useRealtimeDashboard, useRealtimeMessages, useRealtimeMonitor, useTypingPresence
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

/** Subscribes to dashboard_data changes for a given dashboardId and computes derived metrics (messages per hour, active conversations, unread count). */
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
        { event: '*', schema: 'zapp', table: 'dashboard_data' },
        (payload: {
          eventType: string;
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        }) => {
          setUpdates((prev) => [
            ...prev,
            {
              id: payload.new?.id || Date.now().toString(),
              type: payload.eventType,
              data: payload.new || payload.old,
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
        void Promise.resolve(supabase.removeChannel(channelRef.current)).catch(() => {});
        channelRef.current = null;
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
  const lastUpdate = messageUpdates.at(-1);
  const lastMessageAt = lastUpdate?.timestamp ? new Date(lastUpdate.timestamp) : null;
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

/** Subscribes to new evolution_messages for a specific chat JID and accumulates them in local state. */
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
        void Promise.resolve(supabase.removeChannel(channelRef.current)).catch(() => {});
        channelRef.current = null;
      }
    };
  }, [chatId]);

  return { messages };
}

/** Generic realtime monitor for any zapp-schema table; accumulates INSERT/UPDATE/DELETE payloads for debugging or admin panels. */
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
        void Promise.resolve(supabase.removeChannel(channelRef.current)).catch(() => {});
        channelRef.current = null;
      }
    };
  }, [tableName]);

  return { data, changes };
}

/** Tracks typing presence for a chat room using Supabase Presence. Broadcasts the current user's typing state and returns the list of other users currently typing. */
export function useTypingPresenceManagement(userId: string, chatId: string) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!userId || !chatId) return;

    channelRef.current = supabase.channel(`typing:${chatId}`);
    channelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = channelRef.current.presenceState();
        const users = Object.entries(state)
          .filter(([, presence]: [string, Array<{ typing?: boolean }>]) => presence?.[0]?.typing)
          .map(([key]) => key);
        setTypingUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channelRef.current.track({ typing: true });
        }
      });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = undefined;
      }
      if (channelRef.current) {
        void Promise.resolve(supabase.removeChannel(channelRef.current)).catch(() => {});
        channelRef.current = null;
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

/** Re-exported module members. */
export type { RealtimeUpdate };
