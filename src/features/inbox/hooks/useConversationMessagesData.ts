/**
 * useConversationMessagesData — query canônica das mensagens de um contato.
 *
 * UNIFICAÇÃO (BUG-2026-08-06): 3 componentes faziam fetches distintos da mesma
 * tabela `messages` por contato:
 *   - `ConversationHistory`  (limit=100 + gte 30d, fetch cru em useEffect)
 *   - `useContactDetailStats` (select sender,created_at, limit=500)
 *   - `NextBestActionEngine`  (limit=1 desc, fetch cru)
 *
 * Agora todos derivam do MESMO cache (`['conversation-messages', contactId]`),
 * com o mesmo shape do feed principal do chat (select desc, cap 1000 — as
 * 1000 MAIS RECENTES; R7 regression review: antes ASC pegava as 1000 mais
 * antigas e o histórico/NBA mostravam dados errados para contatos grandes) →
 * 1 GET por contato para o painel inteiro.
 *
 * staleTime 30s: sem refetch ao reabrir conversa / re-render.
 */
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { isValidUUID } from '@/utils/uuid';

export interface ConversationMessageLite {
  id: string;
  content: string | null;
  created_at: string;
  sender: string;
}

/** Cap alinhado ao feed principal do chat (useMessages usa pageSize 1000). */
const MESSAGES_CAP = 1000;

export function useConversationMessagesData(contactId: string | null | undefined) {
  return useQuery<ConversationMessageLite[]>({
    queryKey: ['conversation-messages', contactId ?? undefined],
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await safeClient.from<ConversationMessageLite>(
        'messages',
        (q) =>
          q
            .select('id, content, created_at, sender')
            .eq('contact_id', contactId)
            // DESC + range = as 1000 MAIS RECENTES (R7) — consumidores que
            // precisam de ordem cronológica revertem localmente.
            .order('created_at', { ascending: false })
            .range(0, MESSAGES_CAP - 1)
      );
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });
}
