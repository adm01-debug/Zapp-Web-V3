/**
 * normalizeMediaUrl — Normalizes media URLs from legacy DB artifacts.
 *
 * Known corruption patterns (from JSON serialization):
 *   `https://xyz.supabase.co"/storage/...` → `https://xyz.supabase.co/storage/...`
 *   `"https://xyz.supabase.co/..."`       → `https://xyz.supabase.co/...`
 *
 * Audit 2026-07-28 (Hermes): added type guard for non-string inputs + self-hosted
 * domain pattern. Existing supabase.co regex preserved for backward compatibility.
 */
export const normalizeMediaUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';

  return url
    .trim()
    .replace(/^"+|"+$/g, '')
    // Fix corrupted escaped-quote artifacts: domain.com"/path → domain.com/path
    .replace(/\.supabase\.co"\/\//, '.supabase.co/')
    .replace(/\.atomicabr\.com\.br"\/\//, '.atomicabr.com.br/')
    .replace(/([^:]\/)\/+/g, '$1');
};
