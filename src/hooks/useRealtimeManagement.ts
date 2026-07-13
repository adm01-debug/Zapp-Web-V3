// Consolidated Real-time & Live Update Management Module (ETAPA 37)
// Consolidates: useRealtimeDashboard, useRealtimeMessages, useRealtimeMonitor, useTypingPresence
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface RealtimeUpdate {
  id: string;
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

export function useRealtimeDashboardManagement(dashboardId: string) {
  const [updates, setUpdates] = useState<RealtimeUpdate[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!dashboardId) return;

    channelRef.current = supabase.channel(`dashboard:${dashboardId}`);
    channelRef.current
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_data' }, (payload: any) => {
        setUpdates((prev) => [
          ...prev,
          {
            id: payload.new?.id || Date.now().toString(),
            type: payload.eventType,
            data: payload.new || payload.old,
            timestamp: new Date().toISOString(),
          },
        ]);
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [dashboardId]);

  return { updates };
}

export function useRealtimeMessagesManagement(chatId: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!chatId) return;

    channelRef.current = supabase.channel(`chat:${chatId}`);
    channelRef.current
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload: any) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [chatId]);

  return { messages };
}

export function useRealtimeMonitorManagement(tableName: string) {
  const [data, setData] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    channelRef.current = supabase.channel(`monitor:${tableName}`);
    channelRef.current
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload: any) => {
        setChanges((prev) => [...prev, payload]);
        if (payload.eventType === 'INSERT') {
          setData((prev) => [...prev, payload.new]);
        } else if (payload.eventType === 'DELETE') {
          setData((prev) => prev.filter((item) => item.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          setData((prev) => prev.map((item) => (item.id === payload.new.id ? payload.new : item)));
        }
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
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
        const state = channelRef.current.presenceState();
        const users = Object.entries(state)
          .filter(([, presence]: any) => presence?.[0]?.typing)
          .map(([key]) => key);
        setTypingUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channelRef.current.track({ typing: true });
        }
      });

    return () => {
      channelRef.current?.unsubscribe();
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
