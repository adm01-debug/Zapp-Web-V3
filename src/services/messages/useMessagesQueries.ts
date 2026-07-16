/**
 * Messages Queries Hooks
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createListQuery,
  createDetailQuery,
  queryKeys,
} from '@/services/api';
import { messagesService, type Message, type Conversation } from './index';
import type { QueryParams } from '@/services/api/types';

export const useMessagesList = (filters?: Partial<Message> & QueryParams) => {
  return createListQuery(
    queryKeys.messages.list(filters),
    () => messagesService.listMessages(filters),
    { staleTime: 10_000 }
  );
};

export const useMessage = (id?: string) => {
  return createDetailQuery(
    queryKeys.messages.detail(id || ''),
    () => messagesService.getMessage(id!),
    !!id,
    { staleTime: 30_000 }
  );
};

export const useConversationMessages = (conversationId?: string, filters?: Partial<QueryParams>) => {
  return useQuery({
    queryKey: queryKeys.messages.thread(conversationId || ''),
    queryFn: () => messagesService.listConversationMessages(conversationId!, filters),
    enabled: !!conversationId,
    staleTime: 5_000,
  });
};

export const useConversationsList = (filters?: Partial<Conversation> & QueryParams) => {
  return createListQuery(
    queryKeys.messages.list(filters),
    () => messagesService.listConversations(filters),
    { staleTime: 15_000 }
  );
};

export const useConversation = (id?: string) => {
  return createDetailQuery(
    queryKeys.messages.detail(id || ''),
    () => messagesService.getConversation(id!),
    !!id,
    { staleTime: 30_000 }
  );
};

export const useInvalidateMessages = () => {
  const queryClient = useQueryClient();
  return {
    invalidateList: () => queryClient.invalidateQueries({ queryKey: queryKeys.messages.lists() }),
    invalidateDetail: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.messages.detail(id) }),
    invalidateThread: (threadId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.messages.thread(threadId) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() }),
  };
};