/**
 * Queues Mutations Hooks
 */

import {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  queryKeys,
} from '@/services/api';
import { queuesService, type Queue } from './index';

export const useCreateQueue = () => {
  return createCreateMutation(
    (data: Partial<Queue>) => queuesService.create(data),
    {
      invalidateKey: queryKeys.queues.lists(),
      onSuccessMessage: 'Fila criada com sucesso!',
      onErrorMessage: 'Erro ao criar fila.',
      showToasts: true,
    }
  );
};

export const useUpdateQueue = () => {
  return createUpdateMutation(
    ({ id, ...updates }: Partial<Queue> & { id: string }) =>
      queuesService.update(id, updates),
    {
      invalidateKeys: [queryKeys.queues.lists(), queryKeys.queues.details()],
      onSuccessMessage: 'Fila atualizada com sucesso!',
      onErrorMessage: 'Erro ao atualizar fila.',
      showToasts: true,
    }
  );
};

export const useDeleteQueue = () => {
  return createDeleteMutation(
    (id: string) => queuesService.delete(id),
    {
      invalidateKey: queryKeys.queues.lists(),
      onSuccessMessage: 'Fila deletada com sucesso!',
      onErrorMessage: 'Erro ao deletar fila.',
      showToasts: true,
    }
  );
};
