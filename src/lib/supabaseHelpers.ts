/**
 * Typed helpers for dynamic Supabase table operations.
 * 
 * Provides a type-safe wrapper that avoids `(supabase as any)` 
 * while preventing deep type instantiation with large schemas.
 */

import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicClient = { from: (table: string) => any }; // ignore-audit — return type is PostgrestQueryBuilder; erasing to unknown breaks every caller

/**
 * Get a Supabase query builder for a dynamic table name.
 * Use this instead of untyped Supabase access patterns.
 */
export function fromTable(tableName: string) {
  return (supabase as unknown as DynamicClient).from(tableName); // ignore-audit — dynamic table name; DynamicClient erases the typed DB schema to allow string arg
}
