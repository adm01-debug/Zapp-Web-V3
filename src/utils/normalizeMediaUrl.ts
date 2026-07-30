/**
 * normalizeMediaUrl — Normalizes media URLs from legacy DB artifacts.
 *
 * Known corruption patterns (from JSON serialization):
 *   `https://<host>.supabase.co\"/storage/...` → `https://<host>.supabase.co/storage/...`
 *   `"https://<host>.supabase.co/..."`         → `https://<host>.supabase.co/...`
 *
 * Audit 2026-07-28 (Hermes): added type guard for non-string inputs + self-hosted
 * domain pattern. Existing supabase.co regex preserved for backward compatibility.
 * Note: uses [/] in character class to avoid regex-literal delimiter conflict.
 */
export const normalizeMediaUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';

  return url
    .trim()
    .replace(/^"+|"+$/g, '')
    // Fix corrupted escaped-quote artifacts: domain.com"/path → domain.com/path
    .replace(/\.supabase\.co"[/]/, '.supabase.co/')
    .replace(/\.atomicabr\.com\.br"[/]/, '.atomicabr.com.br/')
    .replace(/([^:][/])[/]+/g, '$1');
};
