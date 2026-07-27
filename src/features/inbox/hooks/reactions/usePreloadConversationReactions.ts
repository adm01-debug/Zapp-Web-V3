/**
 * usePreloadConversationReactions
 *
 * Batch-loads ALL reactions for a set of message IDs in a SINGLE Supabase query,
 * then primes the React Query cache so per-message `useMessageReactions` hooks
 * find data immediately without firing individual network requests.
 *
 * Eliminates O(n) → O(1) query pattern for message reactions.
 * Called once at VirtualizedMessageList level where all IDs are known.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { getLogger } from '@/lib/logger';
import type { MessageReaction } from './types';

const log = getLogger('usePreloadConversationReactions');

export function usePreloadConversationReactions(messageIds: string[]): void {
  const queryClient = useQueryClient();
  const joinedRef = useRef('');

  useEffect(() => {
    if (!messageIds.length) return;

    const joined = messageIds.join(',');
    if (joined === joinedRef.current) return;
    joinedRef.current = joined;

    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds);

        if (cancelled) return;
        if (error) {
          log.warn('Preload reactions batch failed', { error: error.message });
          return;
        }

        const raw = (data ?? []) as MessageReaction[];

        // Group by message_id
        const grouped = raw.reduce<Record<string, MessageReaction[]>>((acc, r) => {
          (acc[r.message_id] ??= []).push(r);
          return acc;
        }, {});

        // Prime cache — only write if not already populated to avoid stomping fresher data
        for (const id of messageIds) {
          const key = queryKeys.messageReactions.message(id);
          const state = queryClient.getQueryState(key);
          if (!state || state.status === 'pending') {
            queryClient.setQueryData(key, grouped[id] ?? []);
          }
        }
      } catch (err) {
        if (!cancelled) log.error('Unexpected preload error', err);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageIds.join(','), queryClient]);
}
