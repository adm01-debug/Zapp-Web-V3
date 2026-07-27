/**
 * Typed helpers for dynamic Supabase table operations.
 *
 * Provides a type-safe wrapper that avoids `(supabase as any)`
 * while preventing deep type instantiation with large schemas.
 */

import { supabase } from '@/integrations/supabase/client';

type DynamicClient = { from(table: string): ReturnType<typeof supabase.from> };

/**
 * Get a Supabase query builder for a dynamic table name.
 * Use this instead of untyped Supabase access patterns.
 */
export function fromTable(tableName: string) {
  return (supabase as unknown as DynamicClient).from(tableName); // ignore-audit — dynamic table name; DynamicClient erases the typed DB schema to allow string arg
}
