import { useEffect, useState, useMemo } from 'react';
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

  useEffect(() => {
    if (messageIds.length === 0) {
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
          .in('message_id', messageIds);

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
    return () => { cancelled = true; };
  }, [memoizedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return { reactionsMap, isLoading };
}
