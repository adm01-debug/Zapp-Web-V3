/**
 * Contacts Service Index
 *
 * Centralized exports for contacts service layer.
 * Components and hooks should import from here, not from individual files.
 */

// Repository
export { contactsRepository, type Contact } from './contactsRepository';

// Service
export { contactsService } from './contactsService';

// Query Hooks
export {
  useContactsList,
  useContact,
  useContactsSearch,
  useActiveContacts,
  useArchivedContacts,
  useContactExists,
  useContactsTotal,
  useInvalidateContacts,
} from './useContactsQueries';

// Mutation Hooks
export {
  useCreateContact,
  useCreateContactsBulk,
  useUpdateContact,
  useArchiveContact,
  useRestoreContact,
  useDeleteContact,
  useDeleteContactsBulk,
} from './useContactsMutations';
