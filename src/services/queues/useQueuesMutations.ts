/**
 * Queues Mutations Hooks
 */

import { useCreateMutation, useUpdateMutation, useDeleteMutation, queryKeys } from '@/services/api';
import { queuesService, type Queue } from './index';

/** use Create Queue constant. */
export const useCreateQueue = () => {
  return useCreateMutation((data: Partial<Queue>) => queuesService.create(data), {
    invalidateKey: queryKeys.queues.lists(),
    onSuccessMessage: 'Fila criada com sucesso!',
    onErrorMessage: 'Erro ao criar fila.',
    showToasts: true,
  });
};

/** use Update Queue constant. */
export const useUpdateQueue = () => {
  return useUpdateMutation(
    ({ id, ...updates }: Partial<Queue> & { id: string }) => queuesService.update(id, updates),
    {
      invalidateKeys: [queryKeys.queues.lists(), queryKeys.queues.details()],
      onSuccessMessage: 'Fila atualizada com sucesso!',
      onErrorMessage: 'Erro ao atualizar fila.',
      showToasts: true,
    }
  );
};

/** use Delete Queue constant. */
export const useDeleteQueue = () => {
  return useDeleteMutation((id: string) => queuesService.delete(id), {
    invalidateKey: queryKeys.queues.lists(),
    onSuccessMessage: 'Fila deletada com sucesso!',
    onErrorMessage: 'Erro ao deletar fila.',
    showToasts: true,
  });
};
