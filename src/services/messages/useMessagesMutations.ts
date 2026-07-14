/**
 * Messages Mutations Hooks
 */

import {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  queryKeys,
} from '@/services/api';
import { messagesService, type Message, type Conversation } from './index';

export const useCreateMessage = () => {
  return createCreateMutation(
    (data: Partial<Message>) => messagesService.createMessage(data),
    {
      invalidateKey: queryKeys.messages.lists(),
      onSuccessMessage: 'Mensagem enviada!',
      onErrorMessage: 'Erro ao enviar mensagem.',
      showToasts: true,
    }
  );
};

export const useUpdateMessage = () => {
  return createUpdateMutation(
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

export const useDeleteMessage = () => {
  return createDeleteMutation(
    (id: string) => messagesService.deleteMessage(id),
    {
      invalidateKey: queryKeys.messages.lists(),
      onSuccessMessage: 'Mensagem deletada!',
      onErrorMessage: 'Erro ao deletar mensagem.',
      showToasts: true,
    }
  );
};

export const useCreateConversation = () => {
  return createCreateMutation(
    (data: Partial<Conversation>) => messagesService.createConversation(data),
    {
      invalidateKey: queryKeys.messages.lists(),
      onSuccessMessage: 'Conversa criada!',
      onErrorMessage: 'Erro ao criar conversa.',
      showToasts: true,
    }
  );
};

export const useUpdateConversation = () => {
  return createUpdateMutation(
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

export const useCloseConversation = () => {
  return createUpdateMutation(
    (id: string) => messagesService.closeConversation(id),
    {
      invalidateKey: queryKeys.messages.lists(),
      onSuccessMessage: 'Conversa fechada!',
      onErrorMessage: 'Erro ao fechar conversa.',
      showToasts: true,
    }
  );
};

export const useAssignConversation = () => {
  return createUpdateMutation(
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

export const useMarkMessagesAsRead = () => {
  return createUpdateMutation(
    ({ conversationId, userId }: { conversationId: string; userId: string }) =>
      messagesService.markAsRead(conversationId, userId),
    {
      invalidateKey: queryKeys.messages.lists(),
      showToasts: false,
    }
  );
};
