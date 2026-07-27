import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useBatchReactions');
import type { MessageReaction } from './types';

/**
 * Hook for batch loading reactions for multiple messages.
 *
 * Performance: uses useMemo for messageIds join key to avoid re-triggering
 * on same arrays. Returns a typed Record<string, MessageReaction[]>.
 */
export function useMessagesReactions(messageIds: string[]) {
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const memoizedIds = useMemo(() => messageIds.join(','), [messageIds]);
  const messageIdsRef = useRef(messageIds);
  messageIdsRef.current = messageIds;

  useEffect(() => {
    if (messageIdsRef.current.length === 0) {
      setReactionsMap({});
      return;
    }

    let cancelled = false;

    const fetchReactions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIdsRef.current);

        if (cancelled) return;
        if (error) throw error;

        const rawData = (data || []) as MessageReaction[];

        const grouped = rawData.reduce(
          (acc, r) => {
            if (!acc[r.message_id]) acc[r.message_id] = [];
            acc[r.message_id].push(r);
            return acc;
          },
          {} as Record<string, MessageReaction[]>
        );

        setReactionsMap(grouped);
      } catch (err) {
        if (!cancelled) log.error('Error fetching reactions:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchReactions();
    return () => {
      cancelled = true;
    };
  }, [memoizedIds]);

  return { reactionsMap, isLoading };
}
