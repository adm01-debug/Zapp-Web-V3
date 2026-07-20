/**
 * Users Mutations Hook
 *
 * Hooks for users/agents mutations.
 */

import { useCreateMutation, useUpdateMutation, useDeleteMutation, queryKeys } from '@/services/api';
import { usersService, type User, type Agent } from './index';

/**
 * Hook to create a new user
 */
export const useCreateUser = () => {
  return useCreateMutation((data: Partial<User>) => usersService.createUser(data), {
    invalidateKey: queryKeys.users.lists(),
    onSuccessMessage: 'Usuário criado com sucesso!',
    onErrorMessage: 'Erro ao criar usuário. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to update a user
 */
export const useUpdateUser = () => {
  return useUpdateMutation(
    ({ id, ...updates }: Partial<User> & { id: string }) => usersService.updateUser(id, updates),
    {
      invalidateKeys: [queryKeys.users.lists(), queryKeys.users.details()],
      onSuccessMessage: 'Usuário atualizado com sucesso!',
      onErrorMessage: 'Erro ao atualizar usuário. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to delete a user
 */
export const useDeleteUser = () => {
  return useDeleteMutation((id: string) => usersService.deleteUser(id), {
    invalidateKey: queryKeys.users.lists(),
    onSuccessMessage: 'Usuário deletado com sucesso!',
    onErrorMessage: 'Erro ao deletar usuário. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to create a new agent
 */
export const useCreateAgent = () => {
  return useCreateMutation((data: Partial<Agent>) => usersService.createAgent(data), {
    invalidateKey: queryKeys.users.lists(),
    onSuccessMessage: 'Agente criado com sucesso!',
    onErrorMessage: 'Erro ao criar agente. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to update an agent
 */
export const useUpdateAgent = () => {
  return useUpdateMutation(
    ({ id, ...updates }: Partial<Agent> & { id: string }) => usersService.updateAgent(id, updates),
    {
      invalidateKeys: [queryKeys.users.lists(), queryKeys.users.details()],
      onSuccessMessage: 'Agente atualizado com sucesso!',
      onErrorMessage: 'Erro ao atualizar agente. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to delete an agent
 */
export const useDeleteAgent = () => {
  return useDeleteMutation((id: string) => usersService.deleteAgent(id), {
    invalidateKey: queryKeys.users.lists(),
    onSuccessMessage: 'Agente deletado com sucesso!',
    onErrorMessage: 'Erro ao deletar agente. Tente novamente.',
    showToasts: true,
  });
};
