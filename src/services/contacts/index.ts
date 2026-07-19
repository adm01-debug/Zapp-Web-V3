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
/** Re-exported module members. */
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
/** Re-exported module members. */
export {
  useCreateContact,
  useCreateContactsBulk,
  useUpdateContact,
  useArchiveContact,
  useRestoreContact,
  useDeleteContact,
  useDeleteContactsBulk,
} from './useContactsMutations';
