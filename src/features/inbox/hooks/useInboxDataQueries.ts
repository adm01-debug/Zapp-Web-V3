import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { ConversationWithMessages } from '@/features/inbox';
import { getLogger } from '@/lib/logger';

const log = getLogger('useInboxDataQueries');

/** Loads auxiliary inbox data (custom scopes and a contact→tags map) via React Query; tags are chunked in batches of 500 to stay within PostgREST limits. */
export function useInboxDataQueries(conversations: ConversationWithMessages[]) {
  const { data: customScopes = [] } = useQuery({
    queryKey: queryKeys.contactDetails.inboxScopes(),
    queryFn: async () => {
      const { data, error } = await supabase.from('inbox_custom_scopes')
        .select('id, name')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const { data: contactTagsMap = {} } = useQuery({
    queryKey: queryKeys.contactDetails.tagsMap(),
    queryFn: async () => {
      // FIX #4: Filtrar IDs inválidos ANTES de criar o Set e usar no query
      // - Remove undefined/null/string vazia
      // - Garante que todos os IDs são strings UUID válidas
      // - Previne erro "invalid input syntax for type uuid" no Supabase
      const validContactIds = conversations
        .filter((c): c is ConversationWithMessages & { contact: { id: string } } =>
          c?.contact?.id != null && c.contact.id.length > 0
        )
        .map((c) => c.contact.id);

      if (validContactIds.length === 0) return {};

      const uniqueContactIds = [...new Set(validContactIds)];
      const map: Record<string, string[]> = {};

      const CHUNK_SIZE = 500;
      for (let i = 0; i < uniqueContactIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueContactIds.slice(i, i + CHUNK_SIZE);
        // Validação final do chunk - remove qualquer valor que não seja UUID
        const validChunk = chunk.filter((id): id is string =>
          typeof id === 'string' && id.length === 36 && /^[0-9a-f-]{36}$/i.test(id)
        );

        if (validChunk.length === 0) continue;

        const { data, error } = await supabase.from('contact_tags')
          .select('contact_id, tag_id')
          .in('contact_id', validChunk);

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
    staleTime: 30_000,
  });

  return { customScopes, contactTagsMap };
}
