import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConversationWithMessages } from '@/features/inbox';
import { getLogger } from '@/lib/logger';

// Schema escape hatch: zapp tables not yet in generated types (gen-types-zapp.mjs pendente na VPS)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const log = getLogger('useInboxDataQueries');

export function useInboxDataQueries(conversations: ConversationWithMessages[]) {
  const { data: customScopes = [] } = useQuery({
    queryKey: ['inbox-custom-scopes'],
    queryFn: async () => {
      const { data, error } = await db.from('inbox_custom_scopes')
        .select('id, name')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const { data: contactTagsMap = {} } = useQuery({
    queryKey: ['contact-tags-map'],
    queryFn: async () => {
      const conversationContactIds = new Set(
        conversations.filter((c) => c?.contact?.id).map((c) => c.contact.id)
      );

      if (conversationContactIds.size === 0) return {};

      const contactIds = Array.from(conversationContactIds);
      const map: Record<string, string[]> = {};

      const CHUNK_SIZE = 500;
      for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
        const chunk = contactIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await db.from('contact_tags')
          .select('contact_id, tag_id')
          .in('contact_id', chunk);

        if (error) {
          log.warn('Error fetching contact tags for chunk', { error: error.message });
          continue;
        }

        (data || []).forEach((ct: any) => {
          if (!map[ct.contact_id]) map[ct.contact_id] = [];
          map[ct.contact_id].push(ct.tag_id);
        });
      }

      return map;
    },
    staleTime: 30_000,
  });

  return { customScopes, contactTagsMap };
}
