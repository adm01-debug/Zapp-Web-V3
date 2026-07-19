/**
 * Runtime guards for narrowing `unknown` payloads returned by edge functions.
 *
 * These helpers enforce that fields like `success`, `variants`, `data` etc.
 * actually exist before code accesses them, and they reflect that narrowing
 * back into the TypeScript type system via type predicates.
 */

// ─── Primitive helpers ────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasField<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, unknown> {
  return isRecord(value) && key in value;
}

// ─── Success-shaped responses ─────────────────────────────────────────

/** Success Envelope interface definition. */
export interface SuccessEnvelope<T = unknown> {
  success: boolean;
  [key: string]: unknown;
  // optional payload fields commonly returned
  data?: T;
}

/** True when value is `{ success: boolean, ... }`. */
export function hasSuccessFlag(value: unknown): value is SuccessEnvelope {
  return hasField(value, 'success') && typeof (value as { success: unknown }).success === 'boolean';
}

/** True when value is `{ success: true, ... }`. Safe on null/undefined. */
export function isSuccessful(value: unknown): value is SuccessEnvelope & { success: true } {
  return hasSuccessFlag(value) && value.success === true;
}

/** Reads a numeric field safely, returning fallback when absent or non-numeric. */
export function readNumber(value: unknown, key: string, fallback = 0): number {
  if (!hasField(value, key)) return fallback;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Reads a string field safely. */
export function readString(value: unknown, key: string, fallback = ''): string {
  if (!hasField(value, key)) return fallback;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : fallback;
}

// ─── Array / variants guards ──────────────────────────────────────────

/** True when value has an array field at `key`. */
export function hasArrayField<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, unknown[]> {
  return hasField(value, key) && Array.isArray((value as Record<K, unknown>)[key]);
}

/** Returns the array at `key` if present, otherwise an empty array. */
export function readArray<T = unknown>(value: unknown, key: string): T[] {
  return hasArrayField(value, key) ? ((value as Record<string, unknown[]>)[key] as T[]) : [];
}

/** Convenience for product-like objects that may carry a `variants` array. */
export function readVariants<V = unknown>(value: unknown): V[] {
  return readArray<V>(value, 'variants');
}
