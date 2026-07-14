/**
 * Contacts Service
 *
 * Business logic layer for contacts.
 * Combines repository operations with domain logic.
 * This is what hooks should use, not the repository directly.
 */

import { contactsRepository, type Contact } from './contactsRepository';
import type { ListResponse, QueryParams } from '@/services/api/types';

/**
 * Contacts service with business logic
 */
export const contactsService = {
  /**
   * Get all contacts with optional filtering
   */
  list: async (filters?: Partial<Contact> & QueryParams): Promise<ListResponse<Contact>> => {
    return contactsRepository.list(filters);
  },

  /**
   * Get a single contact by ID
   */
  getById: async (id: string): Promise<Contact | null> => {
    if (!id) throw new Error('Contact ID is required');
    return contactsRepository.getById(id);
  },

  /**
   * Search contacts
   */
  search: async (query: string): Promise<Contact[]> => {
    if (!query || query.length < 2) return [];
    return contactsRepository.search(query.toLowerCase());
  },

  /**
   * Create a new contact with validation
   */
  create: async (contact: Partial<Contact>): Promise<Contact> => {
    // Validation
    if (!contact.name || contact.name.trim().length === 0) {
      throw new Error('Contact name is required');
    }

    if (contact.email && !isValidEmail(contact.email)) {
      throw new Error('Invalid email format');
    }

    const created = await contactsRepository.create({
      ...contact,
      name: contact.name.trim(),
      status: contact.status || 'active',
    });

    return created;
  },

  /**
   * Create multiple contacts
   */
  createBulk: async (contacts: Partial<Contact>[]): Promise<Contact[]> => {
    // Validate each contact
    const validContacts = contacts.map((contact) => {
      if (!contact.name || contact.name.trim().length === 0) {
        throw new Error('All contacts must have a name');
      }
      return {
        ...contact,
        name: contact.name.trim(),
        status: contact.status || 'active',
      };
    });

    return contactsRepository.createBulk(validContacts);
  },

  /**
   * Update a contact
   */
  update: async (id: string, updates: Partial<Contact>): Promise<Contact> => {
    if (!id) throw new Error('Contact ID is required');

    if (updates.email && !isValidEmail(updates.email)) {
      throw new Error('Invalid email format');
    }

    if (updates.name && updates.name.trim().length === 0) {
      throw new Error('Contact name cannot be empty');
    }

    const updated = await contactsRepository.update(id, {
      ...updates,
      name: updates.name?.trim(),
    });

    return updated;
  },

  /**
   * Delete a contact
   */
  delete: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('Contact ID is required');
    return contactsRepository.delete(id);
  },

  /**
   * Delete multiple contacts
   */
  deleteMany: async (ids: string[]): Promise<number> => {
    if (!ids || ids.length === 0) throw new Error('No IDs provided');
    return contactsRepository.deleteMany(ids);
  },

  /**
   * Archive a contact
   */
  archive: async (id: string): Promise<Contact> => {
    if (!id) throw new Error('Contact ID is required');
    return contactsRepository.archive(id);
  },

  /**
   * Restore an archived contact
   */
  restore: async (id: string): Promise<Contact> => {
    if (!id) throw new Error('Contact ID is required');
    return contactsRepository.restore(id);
  },

  /**
   * Get active contacts
   */
  getActive: async (params?: Partial<QueryParams>): Promise<ListResponse<Contact>> => {
    return contactsRepository.getByStatus('active', params);
  },

  /**
   * Get archived contacts
   */
  getArchived: async (params?: Partial<QueryParams>): Promise<ListResponse<Contact>> => {
    return contactsRepository.getByStatus('archived', params);
  },

  /**
   * Get total contacts
   */
  getTotal: async (): Promise<number> => {
    return contactsRepository.count();
  },

  /**
   * Check if contact exists
   */
  exists: async (id: string): Promise<boolean> => {
    if (!id) return false;
    return contactsRepository.exists(id);
  },

  /**
   * Subscribe to contact updates
   */
  onContactsChange: (callback: (contact: Contact) => void) => {
    return contactsRepository.subscribe(callback);
  },
};

/**
 * Helper function to validate email
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
