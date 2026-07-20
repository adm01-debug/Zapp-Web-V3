/**
 * Contacts Mutations Hook
 *
 * Hooks for contacts mutations using standardized patterns.
 * Combines mutationFactory with contactsService for consistent behavior.
 */

import { useCreateMutation, useUpdateMutation, useDeleteMutation, queryKeys } from '@/services/api';
import { contactsService, type Contact } from './index';

/**
 * Hook to create a new contact
 */
export const useCreateContact = () => {
  return useCreateMutation((contact: Partial<Contact>) => contactsService.create(contact), {
    invalidateKey: queryKeys.contacts.lists(),
    onSuccessMessage: 'Contato criado com sucesso!',
    onErrorMessage: 'Erro ao criar contato. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to create multiple contacts
 */
export const useCreateContactsBulk = () => {
  return useCreateMutation((contacts: Partial<Contact>[]) => contactsService.createBulk(contacts), {
    invalidateKey: queryKeys.contacts.lists(),
    onSuccessMessage: 'Contatos criados com sucesso!',
    onErrorMessage: 'Erro ao criar contatos. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to update a contact
 */
export const useUpdateContact = () => {
  return useUpdateMutation(
    ({ id, ...updates }: Partial<Contact> & { id: string }) => contactsService.update(id, updates),
    {
      invalidateKeys: [queryKeys.contacts.lists(), queryKeys.contacts.details()],
      onSuccessMessage: 'Contato atualizado com sucesso!',
      onErrorMessage: 'Erro ao atualizar contato. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to archive a contact
 */
export const useArchiveContact = () => {
  return useUpdateMutation((id: string) => contactsService.archive(id), {
    invalidateKeys: [queryKeys.contacts.lists(), queryKeys.contacts.details()],
    onSuccessMessage: 'Contato arquivado com sucesso!',
    onErrorMessage: 'Erro ao arquivar contato. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to restore an archived contact
 */
export const useRestoreContact = () => {
  return useUpdateMutation((id: string) => contactsService.restore(id), {
    invalidateKeys: [queryKeys.contacts.lists(), queryKeys.contacts.details()],
    onSuccessMessage: 'Contato restaurado com sucesso!',
    onErrorMessage: 'Erro ao restaurar contato. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to delete a contact
 */
export const useDeleteContact = () => {
  return useDeleteMutation((id: string) => contactsService.delete(id), {
    invalidateKey: queryKeys.contacts.lists(),
    onSuccessMessage: 'Contato deletado com sucesso!',
    onErrorMessage: 'Erro ao deletar contato. Tente novamente.',
    showToasts: true,
  });
};

/**
 * Hook to delete multiple contacts
 */
export const useDeleteContactsBulk = () => {
  return useDeleteMutation((ids: string[]) => contactsService.deleteMany(ids), {
    invalidateKey: queryKeys.contacts.lists(),
    onSuccessMessage: 'Contatos deletados com sucesso!',
    onErrorMessage: 'Erro ao deletar contatos. Tente novamente.',
    showToasts: true,
  });
};
