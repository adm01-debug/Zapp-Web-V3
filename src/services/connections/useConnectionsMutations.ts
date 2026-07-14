/**
 * Connections Mutations Hook
 *
 * Hooks for connections mutations using standardized patterns.
 */

import {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  queryKeys,
} from '@/services/api';
import { connectionsService, type WhatsAppConnection } from './index';

/**
 * Hook to create a new WhatsApp connection
 */
export const useCreateWhatsAppConnection = () => {
  return createCreateMutation(
    (data: Partial<WhatsAppConnection>) => connectionsService.createWhatsAppConnection(data),
    {
      invalidateKey: queryKeys.connections.lists(),
      onSuccessMessage: 'Conexão criada com sucesso!',
      onErrorMessage: 'Erro ao criar conexão. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to update a WhatsApp connection
 */
export const useUpdateWhatsAppConnection = () => {
  return createUpdateMutation(
    ({ id, ...updates }: Partial<WhatsAppConnection> & { id: string }) =>
      connectionsService.updateWhatsAppConnection(id, updates),
    {
      invalidateKeys: [
        queryKeys.connections.lists(),
        queryKeys.connections.details(),
      ],
      onSuccessMessage: 'Conexão atualizada com sucesso!',
      onErrorMessage: 'Erro ao atualizar conexão. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to delete a WhatsApp connection
 */
export const useDeleteWhatsAppConnection = () => {
  return createDeleteMutation(
    (id: string) => connectionsService.deleteWhatsAppConnection(id),
    {
      invalidateKey: queryKeys.connections.lists(),
      onSuccessMessage: 'Conexão deletada com sucesso!',
      onErrorMessage: 'Erro ao deletar conexão. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to delete multiple WhatsApp connections
 */
export const useDeleteWhatsAppConnectionsBulk = () => {
  return createDeleteMutation(
    (ids: string[]) => connectionsService.deleteWhatsAppConnectionsBulk(ids),
    {
      invalidateKey: queryKeys.connections.lists(),
      onSuccessMessage: 'Conexões deletadas com sucesso!',
      onErrorMessage: 'Erro ao deletar conexões. Tente novamente.',
      showToasts: true,
    }
  );
};
