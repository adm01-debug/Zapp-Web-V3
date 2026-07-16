import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';

/**
 * Mapping from view IDs to their primary query keys.
 * When user hovers a nav item, we prefetch the data for that view
 * so the transition feels instant.
 */
const VIEW_QUERY_KEYS = {
  inbox: [queryKeys.contacts.all(), queryKeys.messages.all()],
  contacts: [queryKeys.contacts.all()],
  dashboard: [queryKeys.analytics.dashboardStats(), queryKeys.contacts.all()],
  campaigns: [['campaigns']],
  'knowledge-base': [queryKeys.knowledgeBase.articles()],
  automations: [['automations']],
  agents: [queryKeys.users.teamMembers()],
  queues: [queryKeys.queues.all()],
  tags: [['tags']],
} as const;

/**
 * Returns an onMouseEnter handler that triggers query prefetch
 * for a given view, making the view transition feel instant.
 *
 * Only prefetches if data is stale (respects staleTime).
 */
export function usePrefetchOnHover() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (viewId: string) => {
      const keys = VIEW_QUERY_KEYS[viewId];
      if (!keys) return;

      keys.forEach((key) => {
        // Only triggers if data is stale — no wasted requests
        queryClient.prefetchQuery({
          queryKey: key,
          staleTime: 1000 * 60 * 5, // 5 min
        });
      });
    },
    [queryClient]
  );

  return { prefetch };
}
