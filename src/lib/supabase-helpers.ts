/**
 * Helpers for narrowing Supabase result rows that may include SelectQueryError
 * variants from generated types (e.g. when a column mapping isn't inferrable).
 *
 * Usage:
 *   const rows = unwrapRows<MyRow>(data);
 */

/** Casts an unknown Supabase multi-row result to T[], returning an empty array for non-array values. */
export function unwrapRows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data as T[];
}

/** Casts an unknown Supabase single-row result to T, returning null for nullish or non-object values. */
export function unwrapRow<T>(data: unknown): T | null {
  if (!data || typeof data !== 'object') return null;
  return data as T;
}
