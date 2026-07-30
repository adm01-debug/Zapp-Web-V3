/**
 * Contacts Repository
 *
 * Data access layer for contacts.
 * Encapsulates all Supabase queries for contacts.
 * Can be easily mocked for testing.
 */

import { supabase } from '@/integrations/supabase/client';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { applyRetry, createService } from '@/services/api/genericService';
import type { ListResponse, QueryParams } from '@/services/api/types';

// Temporary type - replace with actual type from your schema
export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_reason?: string | null;
  created_at?: string;
  updated_at?: string;
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
    const safe = sanitizePostgrestFilter(query);
    const { data: byName, error: nameError } = await (supabase.from('contacts') as any)
      .select('*')
      .ilike('name', `%${safe}%`)
      .limit(20);

    if (nameError && nameError.code !== 'PGRST116') throw nameError;

    const { data: byEmail, error: emailError } = await (supabase.from('contacts') as any)
      .select('*')
      .ilike('email', `%${safe}%`)
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
    return baseContactsService.deleteMany({ id: ids });
  },

  /**
   * Archive a contact (soft delete via deleted_at)
   */
  archive: async (id: string): Promise<Contact> => {
    return baseContactsService.update(id, {
      deleted_at: new Date().toISOString(),
      deleted_reason: 'archived',
    });
  },

  /**
   * Restore an archived contact (clear deleted_at)
   */
  restore: async (id: string): Promise<Contact> => {
    return baseContactsService.update(id, {
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
    });
  },

  /**
   * Get contacts by archive status (active = not deleted, archived = soft-deleted)
   */
  getByStatus: async (
    status: 'active' | 'archived',
    params?: Partial<QueryParams>
  ): Promise<ListResponse<Contact>> => {
    // contacts table has no status column; filter via deleted_at.
    // genericService.list() treats the string 'null' as IS NULL and 'not_null' as IS NOT NULL.
    if (status === 'archived') {
      return baseContactsService.list({ deleted_at: 'not_null' as unknown as string, ...params });
    }
    return baseContactsService.list({ deleted_at: 'null' as unknown as string, ...params });
  },

  /**
   * Bulk archive contacts (soft delete)
   */
  updateStatusBulk: async (ids: string[], status: 'active' | 'archived'): Promise<Contact[]> => {
    const patch =
      status === 'archived'
        ? { deleted_at: new Date().toISOString(), deleted_reason: 'archived' }
        : { deleted_at: null, deleted_by: null, deleted_reason: null };
    return baseContactsService.updateMany({ id: ids }, patch as Partial<Contact>);
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
