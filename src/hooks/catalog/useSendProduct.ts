// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicCatalogManagement } from '@/hooks/business-logic/useBusinessLogicManagement';
import type { ContactResult, UseBusinessLogicCatalogParams, UseBusinessLogicCatalogResult } from '@/hooks/business-logic/useBusinessLogicManagement';

export type { ContactResult };

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

export function useSendToContact(onSuccess: () => void) {
  const { isSending, sendProductToContact } = useBusinessLogicCatalogManagement({ step: 'configure', onSuccess });
  return { isSending, sendProductToContact };
}
