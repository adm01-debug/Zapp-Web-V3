/**
 * ReactionsBatchProvider + useReactionsBatchContext
 *
 * Substitui o antigo `usePreloadConversationReactions` (efeito que primava o
 * cache sem gate) por um provider que elimina o N+1 de `message_reactions` ao
 * abrir uma conversa (FIX 2026-08-06 — evidência: 30-60 GETs
 * `message_reactions?message_id=eq.<uuid>` por conversa aberta):
 *
 *  - Dispara UMA query batch (`fetchReactionsBatch`) para TODAS as mensagens
 *    visíveis (no máximo 1-2 GETs: batch + profiles para enriquecer nomes);
 *  - Enquanto o batch está pendente, os hooks por-mensagem (`useMessageReactions`)
 *    ficam com `enabled=false` — nenhum GET individual dispara no mount;
 *  - Ao resolver, prima o cache de cada mensagem com
 *    `queryKeys.messageReactions.message(id)` — a MESMA chave lida pelo hook
 *    por-mensagem (staleTime 30s → sem refetch no mount);
 *  - Mantém realtime (invalidação via `useConversationReactionsRealtime`) e
 *    mutações otimistas (`useReactionMutations`) intactos, pois ambos operam
 *    nas chaves por-mensagem já primadas.
 *
 * Usado em `ChatMessagesArea` envolvendo a lista virtualizada de mensagens.
 */
import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { fetchReactionsBatch } from './useBatchReactions';
import type { MessageReaction } from './types';

/** Chave local da query batch (queryKeys.ts é read-only — não adicionamos lá). */
const batchQueryKey = (joinedIds: string) => ['message-reactions-batch', joinedIds] as const;

const EMPTY_IDS_SET: ReadonlySet<string> = new Set();

interface ReactionsBatchContextValue {
  /** IDs cobertos pelo batch atual (mensagens visíveis da conversa). */
  messageIds: ReadonlySet<string>;
  /** true enquanto o GET batch está em voo — per-message hooks devem esperar. */
  isBatchPending: boolean;
}

const ReactionsBatchContext = createContext<ReactionsBatchContextValue | null>(null);

/** Consome o estado do batch; fora do provider retorna "sem batch" (comportamento antigo). */
export function useReactionsBatchContext(): ReactionsBatchContextValue {
  return useContext(ReactionsBatchContext) ?? { messageIds: EMPTY_IDS_SET, isBatchPending: false };
}

interface ReactionsBatchProviderProps {
  messageIds: string[];
  children: ReactNode;
}

/** Provider que agrupa o carregamento de reações das mensagens visíveis em 1-2 GETs. */
export function ReactionsBatchProvider({ messageIds, children }: ReactionsBatchProviderProps) {
  const queryClient = useQueryClient();
  const joinedIds = useMemo(() => messageIds.join('|'), [messageIds]);
  const idsSet = useMemo(() => new Set(messageIds), [messageIds]);

  const { isPending } = useQuery({
    queryKey: batchQueryKey(joinedIds),
    queryFn: async () => {
      // Marca o início do batch para não sobrescrever dados mais frescos
      // (ex.: refetch disparado por realtime durante a busca do batch).
      const batchStartedAt = Date.now();

      const rows = await fetchReactionsBatch(messageIds);

      const grouped = rows.reduce<Record<string, MessageReaction[]>>((acc, r) => {
        (acc[r.message_id] ??= []).push(r);
        return acc;
      }, {});

      // Prime o cache por-mensagem (mesma queryKey lida por useMessageReactions).
      // Guard: só escreve se não houver dados ou se os dados atuais forem mais
      // antigos que o início deste batch (não pisa em dados frescos de realtime).
      for (const id of messageIds) {
        const key = queryKeys.messageReactions.message(id);
        const state = queryClient.getQueryState(key);
        if (!state?.data || state.dataUpdatedAt < batchStartedAt) {
          queryClient.setQueryData(key, grouped[id] ?? []);
        }
      }

      return grouped;
    },
    enabled: messageIds.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    retry: false, // se o batch falhar, o fallback por-mensagem assume (comportamento antigo)
  });

  const value = useMemo(
    () => ({ messageIds: idsSet, isBatchPending: messageIds.length > 0 && isPending }),
    [idsSet, isPending, messageIds.length]
  );

  return createElement(ReactionsBatchContext.Provider, { value }, children);
}
