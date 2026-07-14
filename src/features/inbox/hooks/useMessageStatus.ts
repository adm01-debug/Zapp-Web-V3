import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { dbFrom, dbTable } from '@/integrations/datasource/db';
import { subscribeAllSendStatus, getSendStatus, type SendStatusDetail } from '@/features/inbox';
import type {
  MessageStatusDbRow,
  MessageStatusDetail,
  MessageUIStatus,
} from '@/types/messageStatus';

// Re-export the shared contract so existing call sites
// (`import { MessageStatusDetail } from '@/features/inbox'`) keep working.
export type { MessageStatusDbRow, MessageStatusDetail, MessageUIStatus };

const TRANSIENT: MessageUIStatus[] = ['sending', 'retrying'];

export const useMessageStatus = (contactId?: string) => {
  const [statusUpdates, setStatusUpdates] = useState<Map<string, MessageStatusDbRow>>(new Map());
  const [busTick, setBusTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial statuses from database
  useEffect(() => {
    if (!contactId) {
      setStatusUpdates(new Map());
      return;
    }

    const fetchInitialStatuses = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await dbFrom('messages')
          .select('id, status, status_updated_at, error_code, error_reason')
          .eq('contact_id', contactId)
          .eq('sender', 'agent')
          .not('status', 'is', null);

        if (error) {
          log.error('Error fetching message statuses:', error);
          return;
        }

        if (data) {
          const statusMap = new Map<string, MessageStatusDbRow>();
          data.forEach((msg) => {
            if (msg.status) {
              statusMap.set(msg.id, {
                id: msg.id,
                status: msg.status as MessageUIStatus,
                status_updated_at: msg.status_updated_at || new Date().toISOString(),
                error_code: (msg as { error_code?: string | null }).error_code ?? null,
                error_reason: (msg as { error_reason?: string | null }).error_reason ?? null,
              });
            }
          });
          setStatusUpdates(statusMap);
        }
      } catch (err) {
        log.error('Error in fetchInitialStatuses:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialStatuses();
  }, [contactId]);

  // Subscribe to realtime status updates from DB
  useEffect(() => {
    if (!contactId) return;

    logMessagesSubscribe('useMessageStatus', {
      event: 'UPDATE',
      table: dbTable('messages'),
      filter: `contact_id=eq.${contactId}`,
    });
    const channel = supabase
      .channel(`message-status-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo', // FATOR X v6.2: tabela-fonte (view public não emite)
          table: 'evolution_messages',
          filter: `contact_id=eq.${contactId}`,
        },
        wrapMessagesHandler<{ new: Record<string, unknown>; old?: Record<string, unknown> }>(
          'useMessageStatus',
          (payload) => {
            const newData = payload.new as {
              id: string;
              status: string;
              status_updated_at?: string;
              status_at?: string; // fonte evo.evolution_messages usa status_at
              error_code?: string | null;
              error_reason?: string | null;
            };
            if (newData.status) {
              setStatusUpdates((prev) => {
                const updated = new Map(prev);
                updated.set(newData.id, {
                  id: newData.id,
                  status: newData.status as MessageUIStatus,
                  status_updated_at:
                    newData.status_updated_at ?? newData.status_at ?? new Date().toISOString(),
                  error_code: newData.error_code ?? null,
                  error_reason: newData.error_reason ?? null,
                });
                return updated;
              });
            }
          }
        )
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  // Subscribe to in-memory bus (transient + immediate updates)
  useEffect(() => {
    const unsub = subscribeAllSendStatus(() => setBusTick((t) => t + 1));
    return unsub;
  }, []);

  const getMessageStatus = useCallback(
    (messageId: string): MessageUIStatus | undefined => {
      const bus = getSendStatus(messageId);
      const db = statusUpdates.get(messageId);
      // Bus wins for transient states
      if (bus && TRANSIENT.includes(bus.status)) return bus.status;
      // Otherwise pick most recent terminal
      if (bus && !db) return bus.status;
      if (!bus && db) return db.status;
      if (bus && db) {
        const busTime = bus.updatedAt;
        const dbTime = new Date(db.status_updated_at).getTime();
        return busTime >= dbTime ? bus.status : db.status;
      }
      return undefined;
    },
    [statusUpdates, busTick]
  );

  const getMessageStatusDetail = useCallback(
    (messageId: string): MessageStatusDetail | undefined => {
      const bus: SendStatusDetail | undefined = getSendStatus(messageId);
      const db = statusUpdates.get(messageId);
      const status = getMessageStatus(messageId);
      if (!status) return undefined;
      if (
        bus &&
        (TRANSIENT.includes(bus.status) ||
          !db ||
          bus.updatedAt >= new Date(db.status_updated_at).getTime())
      ) {
        return {
          status,
          attempt: bus.attempt,
          totalRetries: bus.totalRetries,
          errorCode: bus.errorCode ?? db?.error_code ?? undefined,
          errorReason: bus.errorReason ?? db?.error_reason ?? undefined,
        };
      }
      return {
        status,
        errorCode: db?.error_code ?? undefined,
        errorReason: db?.error_reason ?? undefined,
      };
    },
    [statusUpdates, busTick, getMessageStatus]
  );

  const updateLocalStatus = useCallback((messageId: string, status: MessageUIStatus) => {
    setStatusUpdates((prev) => {
      const updated = new Map(prev);
      updated.set(messageId, {
        id: messageId,
        status,
        status_updated_at: new Date().toISOString(),
      });
      return updated;
    });
  }, []);

  return {
    statusUpdates,
    getMessageStatus,
    getMessageStatusDetail,
    updateLocalStatus,
    isLoading,
  };
};
