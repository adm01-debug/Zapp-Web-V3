/**
 * Generic Service Factory
 *
 * Creates a standardized service for any Supabase table.
 * Reduces boilerplate and ensures consistent API patterns across the application.
 *
 * Usage:
 * const contactsService = createService('contacts', Contact);
 * const result = await contactsService.list();
 */

import { supabase } from '@/integrations/supabase/client';
import type { ListResponse, QueryParams } from './types';

interface ServiceOptions {
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Factory function to create a standardized service for any table
 */
export const createService = <T = any>(
  tableName: string,
  options?: ServiceOptions
) => {
  const { orderBy = 'created_at', orderDirection = 'desc' } = options || {};
  // Dynamic table accessor — tableName is a runtime string, not a literal from the generated types
  const db = supabase as unknown as { from(t: string): ReturnType<typeof supabase.from> };

  return {
    /**
     * List all records with optional filtering and pagination
     */
    async list(filters?: Partial<T> & QueryParams): Promise<ListResponse<T>> {
      let query = db
        .from(tableName)
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters) {
        const {
          page = 1,
          pageSize = 50,
          sortBy = orderBy,
          sortOrder = orderDirection,
          ...filterParams
        } = filters;

        // Apply field filters
        Object.entries(filterParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              query = query.in(key, value);
            } else if (typeof value === 'object') {
              // Handle range filters: { min: 10, max: 100 }
              if ('min' in value) query = query.gte(key, value.min);
              if ('max' in value) query = query.lte(key, value.max);
            } else if (value === 'null') {
              query = query.is(key, null);
            } else if (value === 'not_null') {
              query = query.not(key, 'is', null);
            } else {
              query = query.eq(key, value);
            }
          }
        });

        // Apply sorting
        query = query.order(sortBy, { ascending: sortOrder === 'asc' });

        // Apply pagination
        const offset = (page - 1) * pageSize;
        query = query.range(offset, offset + pageSize - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return {
          data: data || [],
          total: count || 0,
          page,
          pageSize,
        };
      }

      const { data, error, count } = await query
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .limit(50);

      if (error) throw error;

      return {
        data: data || [],
        total: count || 0,
        page: 1,
        pageSize: 50,
      };
    },

    /**
     * Get a single record by ID
     */
    async get(id: string): Promise<T | null> {
      const { data, error } = await db
        .from(tableName)
        .select('*')
        .eq('id', id)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data || null;
    },

    /**
     * Search records by a text field
     */
    async search(query: string, searchField: string = 'name'): Promise<T[]> {
      const { data, error } = await db
        .from(tableName)
        .select('*')
        .ilike(searchField, `%${query}%`);

      if (error) throw error;
      return data || [];
    },

    /**
     * Create a new record
     */
    async create(record: Partial<T>): Promise<T> {
      const { data, error } = await db
        .from(tableName)
        .insert([record])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Create multiple records
     */
    async createBulk(records: Partial<T>[]): Promise<T[]> {
      const { data, error } = await db
        .from(tableName)
        .insert(records)
        .select();

      if (error) throw error;
      return data || [];
    },

    /**
     * Update a record by ID
     */
    async update(id: string, updates: Partial<T>): Promise<T> {
      const { data, error } = await db
        .from(tableName)
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (error) throw error;
      return data;
    },

    /**
     * Update multiple records matching a condition
     */
    async updateMany(
      condition: Partial<T>,
      updates: Partial<T>
    ): Promise<T[]> {
      let query = db.from(tableName).update(updates);

      Object.entries(condition).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      const { data, error } = await query.select();

      if (error) throw error;
      return data || [];
    },

    /**
     * Delete a record by ID
     */
    async delete(id: string): Promise<{ id: string }> {
      const { error } = await db
        .from(tableName)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id };
    },

    /**
     * Delete multiple records matching a condition
     */
    async deleteMany(condition: Partial<T>): Promise<number> {
      let query = db.from(tableName).delete();

      Object.entries(condition).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      const { count, error } = await query;

      if (error) throw error;
      return count || 0;
    },

    /**
     * Check if a record exists
     */
    async exists(id: string): Promise<boolean> {
      const { data, error } = await db
        .from(tableName)
        .select('id')
        .eq('id', id)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    },

    /**
     * Count records matching a condition
     */
    async count(condition?: Partial<T>): Promise<number> {
      let query = db
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (condition) {
        Object.entries(condition).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },

    /**
     * Subscribe to realtime updates
     */
    subscribe(
      callback: (data: T) => void,
      filter?: Partial<T>
    ) {
      const channel = supabase
        .channel(`${tableName}-changes`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'zapp',
            table: tableName,
          },
          (payload: { new: T }) => {
            callback(payload.new);
          }
        )
        .subscribe();

      return () => {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      };
    },
  };
};

/**
 * Retry policy for failed operations
 */
export const applyRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> => {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
};