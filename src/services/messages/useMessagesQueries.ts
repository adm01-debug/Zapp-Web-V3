// @ts-nocheck
/**
 * Messages Queries Hooks
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListQuery, useDetailQuery, queryKeys } from '@/services/api';
import { messagesService, type Message, type Conversation } from './index';
import type { QueryParams } from '@/services/api/types';

/** use Messages List constant. */
export const useMessagesList = (filters?: Partial<Message> & QueryParams) => {
  return useListQuery(
    queryKeys.messages.list(filters),
    () => messagesService.listMessages(filters),
    { staleTime: 10_000 }
  );
};

/** use Message constant. */
export const useMessage = (id?: string) => {
  return useDetailQuery(
    queryKeys.messages.detail(id || ''),
    () => messagesService.getMessage(id ?? ''),
    !!id,
    { staleTime: 30_000 }
  );
};

/** use Conversation Messages constant. */
export const useConversationMessages = (
  conversationId?: string,
  filters?: Partial<QueryParams>
) => {
  return useQuery({
    queryKey: queryKeys.messages.thread(conversationId || ''),
    queryFn: () => messagesService.listConversationMessages(conversationId ?? '', filters),
    enabled: !!conversationId,
    staleTime: 5_000,
  });
};

/** use Conversations List constant. */
export const useConversationsList = (filters?: Partial<Conversation> & QueryParams) => {
  return useListQuery(
    queryKeys.messages.conversationList(filters),
    () => messagesService.listConversations(filters),
    { staleTime: 15_000 }
  );
};

/** use Conversation constant. */
export const useConversation = (id?: string) => {
  return useDetailQuery(
    queryKeys.messages.conversationDetail(id || ''),
    () => messagesService.getConversation(id ?? ''),
    !!id,
    { staleTime: 30_000 }
  );
};

/** use Invalidate Messages constant. */
export const useInvalidateMessages = () => {
  const queryClient = useQueryClient();
  return {
    invalidateList: () => queryClient.invalidateQueries({ queryKey: queryKeys.messages.lists() }),
    invalidateDetail: (id: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.detail(id) }),
    invalidateThread: (threadId: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.thread(threadId) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() }),
  };
};
