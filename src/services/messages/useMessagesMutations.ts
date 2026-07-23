/**
 * Messages Mutations Hooks
 */

import { useCreateMutation, useUpdateMutation, useDeleteMutation, queryKeys } from '@/services/api';
import { messagesService, type Message, type Conversation } from './index';

/** React Query mutation hook for creating a new message; shows toast on success/error and invalidates the messages list. */
export const useCreateMessage = () => {
  return useCreateMutation((data: Partial<Message>) => messagesService.createMessage(data), {
    invalidateKey: queryKeys.messages.lists(),
    onSuccessMessage: 'Mensagem enviada!',
    onErrorMessage: 'Erro ao enviar mensagem.',
    showToasts: true,
  });
};

/** React Query mutation hook for updating an existing message by id; invalidates both list and detail query keys. */
export const useUpdateMessage = () => {
  return useUpdateMutation(
    ({ id, ...updates }: Partial<Message> & { id: string }) =>
      messagesService.updateMessage(id, updates),
    {
      invalidateKeys: [queryKeys.messages.lists(), queryKeys.messages.details()],
      onSuccessMessage: 'Mensagem atualizada!',
      onErrorMessage: 'Erro ao atualizar mensagem.',
      showToasts: true,
    }
  );
};

/** React Query mutation hook for soft-deleting a message by id; invalidates the messages list. */
export const useDeleteMessage = () => {
  return useDeleteMutation((id: string) => messagesService.deleteMessage(id), {
    invalidateKey: queryKeys.messages.lists(),
    onSuccessMessage: 'Mensagem deletada!',
    onErrorMessage: 'Erro ao deletar mensagem.',
    showToasts: true,
  });
};

/** React Query mutation hook for creating a new conversation; invalidates the messages list. */
export const useCreateConversation = () => {
  return useCreateMutation(
    (data: Partial<Conversation>) => messagesService.createConversation(data),
    {
      invalidateKey: queryKeys.messages.lists(),
      onSuccessMessage: 'Conversa criada!',
      onErrorMessage: 'Erro ao criar conversa.',
      showToasts: true,
    }
  );
};

/** React Query mutation hook for updating a conversation by id; invalidates both list and detail query keys. */
export const useUpdateConversation = () => {
  return useUpdateMutation(
    ({ id, ...updates }: Partial<Conversation> & { id: string }) =>
      messagesService.updateConversation(id, updates),
    {
      invalidateKeys: [queryKeys.messages.lists(), queryKeys.messages.details()],
      onSuccessMessage: 'Conversa atualizada!',
      onErrorMessage: 'Erro ao atualizar conversa.',
      showToasts: true,
    }
  );
};

/** React Query mutation hook for closing a conversation by id; invalidates the messages list. */
export const useCloseConversation = () => {
  return useUpdateMutation((id: string) => messagesService.closeConversation(id), {
    invalidateKey: queryKeys.messages.lists(),
    onSuccessMessage: 'Conversa fechada!',
    onErrorMessage: 'Erro ao fechar conversa.',
    showToasts: true,
  });
};

/** React Query mutation hook for assigning a conversation to a specific agent; invalidates both list and detail query keys. */
export const useAssignConversation = () => {
  return useUpdateMutation(
    ({ id, agentId }: { id: string; agentId: string }) =>
      messagesService.assignConversation(id, agentId),
    {
      invalidateKeys: [queryKeys.messages.lists(), queryKeys.messages.details()],
      onSuccessMessage: 'Conversa atribuída!',
      onErrorMessage: 'Erro ao atribuir conversa.',
      showToasts: true,
    }
  );
};

/** React Query mutation hook for marking all messages in a conversation as read; runs silently without toasts. */
export const useMarkMessagesAsRead = () => {
  return useUpdateMutation(
    ({ conversationId, userId }: { conversationId: string; userId: string }) =>
      messagesService.markAsRead(conversationId, userId),
    {
      invalidateKey: queryKeys.messages.lists(),
      showToasts: false,
    }
  );
};
