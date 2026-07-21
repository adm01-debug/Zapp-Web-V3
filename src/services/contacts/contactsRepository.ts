// @ts-nocheck
/**
 * Contacts Repository
 *
 * Data access layer for contacts.
 * Encapsulates all Supabase queries for contacts.
 * Can be easily mocked for testing.
 */

import { supabase } from '@/integrations/supabase/client';
import { applyRetry, createService } from '@/services/api/genericService';
import type { ListResponse, QueryParams } from '@/services/api/types';

// Temporary type - replace with actual type from your schema
export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Base contacts service created from generic factory
 */
const baseContactsService = createService<Contact>('contacts', {
  orderBy: 'created_at',
  orderDirection: 'desc',
});

/**
 * Contacts repository with specialized methods
 * Combines generic operations with domain-specific queries
 */
export const contactsRepository = {
  /**
   * List all contacts
   */
  list: async (filters?: Partial<Contact> & QueryParams): Promise<ListResponse<Contact>> => {
    return baseContactsService.list(filters);
  },

  /**
   * Get a single contact by ID
   */
  getById: async (id: string): Promise<Contact | null> => {
    return baseContactsService.get(id);
  },

  /**
   * Search contacts by name or email
   */
  search: async (query: string): Promise<Contact[]> => {
    const { data: byName, error: nameError } = await supabase
      .from('contacts')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(20);

    if (nameError && nameError.code !== 'PGRST116') throw nameError;

    const { data: byEmail, error: emailError } = await supabase
      .from('contacts')
      .select('*')
      .ilike('email', `%${query}%`)
      .limit(20);

    if (emailError && emailError.code !== 'PGRST116') throw emailError;

    // Combine and deduplicate results
    const combined = [...(byName || []), ...(byEmail || [])];
    const uniqueIds = new Set();
    return combined.filter((contact) => {
      if (uniqueIds.has(contact.id)) return false;
      uniqueIds.add(contact.id);
      return true;
    });
  },

  /**
   * Create a new contact
   */
  create: async (contact: Partial<Contact>): Promise<Contact> => {
    return baseContactsService.create(contact);
  },

  /**
   * Create multiple contacts
   */
  createBulk: async (contacts: Partial<Contact>[]): Promise<Contact[]> => {
    return baseContactsService.createBulk(contacts);
  },

  /**
   * Update a contact
   */
  update: async (id: string, updates: Partial<Contact>): Promise<Contact> => {
    return baseContactsService.update(id, updates);
  },

  /**
   * Delete a contact
   */
  delete: async (id: string): Promise<{ id: string }> => {
    return baseContactsService.delete(id);
  },

  /**
   * Delete multiple contacts
   */
  deleteMany: async (ids: string[]): Promise<number> => {
    return baseContactsService.deleteMany({ id: ids as unknown as string });
  },

  /**
   * Archive a contact (soft delete)
   */
  archive: async (id: string): Promise<Contact> => {
    return baseContactsService.update(id, { status: 'archived' });
  },

  /**
   * Restore an archived contact
   */
  restore: async (id: string): Promise<Contact> => {
    return baseContactsService.update(id, { status: 'active' });
  },

  /**
   * Get contacts by status
   */
  getByStatus: async (
    status: 'active' | 'archived',
    params?: Partial<QueryParams>
  ): Promise<ListResponse<Contact>> => {
    return baseContactsService.list({ status, ...params });
  },

  /**
   * Bulk update status
   */
  updateStatusBulk: async (ids: string[], status: 'active' | 'archived'): Promise<Contact[]> => {
    return baseContactsService.updateMany({ id: ids as unknown as string }, { status });
  },

  /**
   * Get total contacts count
   */
  count: async (): Promise<number> => {
    return baseContactsService.count();
  },

  /**
   * Check if contact exists
   */
  exists: async (id: string): Promise<boolean> => {
    return baseContactsService.exists(id);
  },

  /**
   * Subscribe to contact changes
   */
  subscribe: (callback: (contact: Contact) => void) => {
    return baseContactsService.subscribe(callback);
  },

  /**
   * Advanced search with retry
   */
  searchWithRetry: async (query: string, maxRetries = 3): Promise<Contact[]> => {
    return applyRetry(() => contactsRepository.search(query), maxRetries);
  },
};
