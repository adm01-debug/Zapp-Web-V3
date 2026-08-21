import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { ConversationWithMessages } from '@/features/inbox';
import { getLogger } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';
import { QUERY_STALE_TIMES, QUERY_GC_TIMES } from '@/lib/queryStaleTimes';

const log = getLogger('useInboxDataQueries');

/** Loads auxiliary inbox data (custom scopes and a contact→tags map) via React Query; tags are chunked in batches of 500 to stay within PostgREST limits. */
export function useInboxDataQueries(conversations: ConversationWithMessages[]) {
  const { data: customScopes = [] } = useQuery({
    queryKey: queryKeys.contactDetails.inboxScopes(),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('inbox_custom_scopes')
        .select('id, name')
        .eq('is_active', true)
        .abortSignal(signal);
      if (error) throw error;
      return data || [];
    },
    staleTime: QUERY_STALE_TIMES.inboxCustomScopes,
    gcTime: QUERY_GC_TIMES.inboxCustomScopes,
  });

  const { data: contactTagsMap = {} } = useQuery({
    queryKey: queryKeys.contactDetails.tagsMap(),
    enabled: conversations.length > 0,
    queryFn: async ({ signal }) => {
      const conversationContactIds = new Set(
        conversations.filter((c) => c?.contact?.id).map((c) => c.contact.id)
      );

      if (conversationContactIds.size === 0) return {};

      const contactIds = Array.from(conversationContactIds);
      const map: Record<string, string[]> = {};

      const validContactIds = contactIds.filter(isValidUUID);
      if (validContactIds.length === 0) return {};

      const CHUNK_SIZE = 500;
      for (let i = 0; i < validContactIds.length; i += CHUNK_SIZE) {
        if (signal?.aborted) break;
        const chunk = validContactIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('contact_tags')
          .select('contact_id, tag_id')
          .in('contact_id', chunk)
          .abortSignal(signal);

        if (error) {
          log.warn('Error fetching contact tags for chunk', { error: error.message });
          continue;
        }

        (data || []).forEach((ct) => {
          if (!map[ct.contact_id]) map[ct.contact_id] = [];
          map[ct.contact_id].push(ct.tag_id);
        });
      }

      return map;
    },
    staleTime: QUERY_STALE_TIMES.contactTags,
    gcTime: QUERY_GC_TIMES.contactTags,
  });

  return { customScopes, contactTagsMap };
}
