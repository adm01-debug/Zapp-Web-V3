/**
 * Helpers for narrowing Supabase result rows that may include SelectQueryError
 * variants from generated types (e.g. when a column mapping isn't inferrable).
 *
 * Usage:
 *   const rows = unwrapRows<MyRow>(data);
 */

export function unwrapRows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data as T[];
}

export function unwrapRow<T>(data: unknown): T | null {
  if (!data || typeof data !== 'object') return null;
  return data as T;
}
