import { useCallback } from 'react';
import { useArchiveContact, useRestoreContact } from '@/services/contacts/useContactsMutations';

/**
 * Ações reais de arquivar/desarquivar conversas da inbox.
 *
 * Arquiva o CONTATO via soft-delete canônico do app
 * (contactsRepository.archive/restore → deleted_at + deleted_reason='archived').
 * A inbox usa contacts+messages como fonte, então arquivar a conversa ==
 * arquivar o contato dono da conversa.
 *
 * @param onDone callback opcional disparado após sucesso (ex.: refetch da inbox
 *   para remover/re-adicionar o item na lista imediatamente).
 */
export function useArchiveConversationActions(onDone?: () => void) {
  const { mutateAsync: archiveContact } = useArchiveContact();
  const { mutateAsync: restoreContact } = useRestoreContact();

  const archive = useCallback(
    async (contactId: string) => {
      if (!contactId) return;
      await archiveContact(contactId);
      onDone?.();
    },
    [archiveContact, onDone]
  );

  const restore = useCallback(
    async (contactId: string) => {
      if (!contactId) return;
      await restoreContact(contactId);
      onDone?.();
    },
    [restoreContact, onDone]
  );

  return { archive, restore };
}
