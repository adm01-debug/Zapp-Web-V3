/**
 * Contacts Mutations Hook
 *
 * Hooks for contacts mutations using standardized patterns.
 * Combines mutationFactory with contactsService for consistent behavior.
 */

import {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  queryKeys,
} from '@/services/api';
import { contactsService, type Contact } from './index';

/**
 * Hook to create a new contact
 */
export const useCreateContact = () => {
  return createCreateMutation(
    (contact: Partial<Contact>) => contactsService.create(contact),
    {
      invalidateKey: queryKeys.contacts.lists(),
      onSuccessMessage: 'Contato criado com sucesso!',
      onErrorMessage: 'Erro ao criar contato. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to create multiple contacts
 */
export const useCreateContactsBulk = () => {
  return createCreateMutation(
    (contacts: Partial<Contact>[]) => contactsService.createBulk(contacts),
    {
      invalidateKey: queryKeys.contacts.lists(),
      onSuccessMessage: 'Contatos criados com sucesso!',
      onErrorMessage: 'Erro ao criar contatos. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to update a contact
 */
export const useUpdateContact = () => {
  return createUpdateMutation(
    ({ id, ...updates }: Partial<Contact> & { id: string }) =>
      contactsService.update(id, updates),
    {
      invalidateKeys: [
        queryKeys.contacts.lists(),
        queryKeys.contacts.details(),
      ],
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
  return createUpdateMutation(
    (id: string) => contactsService.archive(id),
    {
      invalidateKeys: [
        queryKeys.contacts.lists(),
        queryKeys.contacts.details(),
      ],
      onSuccessMessage: 'Contato arquivado com sucesso!',
      onErrorMessage: 'Erro ao arquivar contato. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to restore an archived contact
 */
export const useRestoreContact = () => {
  return createUpdateMutation(
    (id: string) => contactsService.restore(id),
    {
      invalidateKeys: [
        queryKeys.contacts.lists(),
        queryKeys.contacts.details(),
      ],
      onSuccessMessage: 'Contato restaurado com sucesso!',
      onErrorMessage: 'Erro ao restaurar contato. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to delete a contact
 */
export const useDeleteContact = () => {
  return createDeleteMutation(
    (id: string) => contactsService.delete(id),
    {
      invalidateKey: queryKeys.contacts.lists(),
      onSuccessMessage: 'Contato deletado com sucesso!',
      onErrorMessage: 'Erro ao deletar contato. Tente novamente.',
      showToasts: true,
    }
  );
};

/**
 * Hook to delete multiple contacts
 */
export const useDeleteContactsBulk = () => {
  return createDeleteMutation(
    (ids: string[]) => contactsService.deleteMany(ids),
    {
      invalidateKey: queryKeys.contacts.lists(),
      onSuccessMessage: 'Contatos deletados com sucesso!',
      onErrorMessage: 'Erro ao deletar contatos. Tente novamente.',
      showToasts: true,
    }
  );
};
