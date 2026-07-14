/**
 * Normalizes various date inputs into a valid Date object.
 * Returns a fallback date (now) if the input is invalid to prevent
 * utility functions like formatDistanceToNow from crashing.
 */
export const toValidDate = (v: unknown, fallback: Date | null = new Date()): Date | null => {
  if (!v) return fallback;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return isNaN(d.getTime()) ? fallback : d;
};
