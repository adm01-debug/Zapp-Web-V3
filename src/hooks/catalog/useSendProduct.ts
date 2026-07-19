// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicCatalogManagement } from '@/features/business-logic/hooks/useBusinessLogicManagement';
import type { ContactResult } from '@/features/business-logic/hooks/useBusinessLogicManagement';

/** Re-exported module members. */
export type { ContactResult };

/** Hook: use Contact Search. */
export function useContactSearch(step: 'configure' | 'selectContact') {
  const { contactSearch, setContactSearch, contactResults, searchingContacts, selectedContact, setSelectedContact, resetContactSelection } = useBusinessLogicCatalogManagement({ step, onSuccess: () => {} });
  return {
    contactSearch,
    setContactSearch,
    contactResults,
    searchingContacts,
    selectedContact,
    setSelectedContact,
    resetContactSelection,
  };
}

/** Hook: use Send To Contact. */
export function useSendToContact(onSuccess: () => void) {
  const { isSending, sendProductToContact } = useBusinessLogicCatalogManagement({ step: 'configure', onSuccess });
  return { isSending, sendProductToContact };
}
