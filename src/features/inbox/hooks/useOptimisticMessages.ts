import { useCallback, useRef, useState, useEffect } from 'react';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { getLogger } from '@/lib/logger';
import { Message } from '@/types/chat';

const log = getLogger('useOptimisticMessages');

/**
 * Provides optimistic message updates for the chat UI.
 */

let optimisticCounter = 0;

export interface OptimisticMessage extends Message {
  _optimistic: true;
  contact_id: string;
}

export function useOptimisticMessages(context?: { userId?: string }) {
  const [pending, setPending] = useState<Record<string, OptimisticMessage>>({});
  const lastRemovedIdRef = useRef<string | null>(null);
  
  // Use a ref to store the latest pending state for non-reactive logic if needed,
  // but we prefer state for UI reactivity.
  const pendingRef = useRef<Record<string, OptimisticMessage>>({});
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const createOptimistic = useCallback(
    (params: {
      contactId: string;
      conversationId: string;
      content: string;
      messageType?: Message['type'];
      replyToId?: string | null;
      mediaUrl?: string | null;
      contactAvatar?: string | null;
    }): OptimisticMessage => {
      optimisticCounter++;
      const now = new Date();
      const tempId = `optimistic:${now.getTime()}:${optimisticCounter}`;

      const optimistic: OptimisticMessage = {
        id: tempId,
        _optimistic: true,
        contact_id: params.contactId,
        conversationId: params.conversationId,
        content: params.content,
        type: params.messageType || 'text',
        sender: 'agent',
        status: 'sending',
        timestamp: now,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        external_id: undefined,
        mediaUrl: params.mediaUrl || undefined,
        replyTo: params.replyToId ? { messageId: params.replyToId, content: '', sender: 'contact' } : undefined,
        contactAvatar: params.contactAvatar || null,
        is_deleted: false,
      };

      setPending(prev => ({ ...prev, [tempId]: optimistic }));
      return optimistic;
    },
    [],
  );

  const confirmSent = useCallback((tempId: string, externalId?: string | null) => {
    setPending(prev => {
      if (!prev[tempId]) return prev;
      return {
        ...prev,
        [tempId]: {
          ...prev[tempId],
          status: 'sent',
          external_id: externalId || prev[tempId].external_id
        }
      };
    });
  }, []);

  const failOptimistic = useCallback((tempId: string): OptimisticMessage | undefined => {
    let result: OptimisticMessage | undefined;
    setPending(prev => {
      if (!prev[tempId]) return prev;
      result = { ...prev[tempId], status: 'failed' };
      return { ...prev, [tempId]: result };
    });
    return result;
  }, []);

  const cleanup = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setPending(prev => {
      const next = { ...prev };
      let changed = false;
      ids.forEach(id => {
        if (next[id]) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const mergeWithReal = useCallback(
    (realMessages: Message[]): (Message | OptimisticMessage)[] => {
      const pendingList = Object.values(pending);
      if (pendingList.length === 0 || !isFeatureEnabled('optimistic_messages', context)) return realMessages;

      const realExternalIds = new Set(realMessages.map(m => m.external_id).filter(Boolean));
      // Fingerprint match criteria: agent messages, recently sent, match content
      const recentAgentSends = realMessages.filter(m => m.sender === 'agent').slice(-15);
      const realContentSet = new Set(recentAgentSends.map((m) => m.content?.trim()));
      const realTypeSet = new Set(recentAgentSends.map((m) => m.type));

      const stillPending: OptimisticMessage[] = [];
      const toRemove: string[] = [];

      for (const opt of pendingList) {
        let confirmed = false;
        
        // 1. External ID match (best accuracy)
        if (opt.external_id && realExternalIds.has(opt.external_id)) {
          confirmed = true;
        } 
        // 2. Content match (fallback for before ID is known or missing ID in real event)
        else if (realContentSet.has(opt.content?.trim()) && (opt.type === 'text' || realTypeSet.has(opt.type))) {
          confirmed = true;
        }
        
        const age = Date.now() - new Date(opt.timestamp).getTime();
        // 3. TTL Expiry (2 minutes)
        if (confirmed || age > 120000) {
          toRemove.push(opt.id);
        } else {
          stillPending.push(opt);
        }
      }

      if (toRemove.length > 0) {
        // Trigger cleanup in next tick to avoid state updates during render
        Promise.resolve()
          .then(() => cleanup(toRemove))
          .catch((err) => {
            log.error('Optimistic message cleanup failed', err);
          });
      }
      
      if (stillPending.length === 0) return realMessages;

      // Ensure we don't duplicate if a message was just removed but still in state
      const filteredStillPending = stillPending.filter(p => !toRemove.includes(p.id));

      return [...realMessages, ...filteredStillPending].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    },
    [pending, cleanup],
  );

  return {
    createOptimistic,
    confirmSent,
    failOptimistic,
    mergeWithReal,
    cleanup,
    pendingCount: Object.keys(pending).length,
    pending, // exposed for testing
  };
}
