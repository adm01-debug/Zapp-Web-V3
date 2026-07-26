/**
 * storage-url.ts — ADR-001 compliant public URL builder for Edge Functions.
 *
 * WHY THIS EXISTS:
 *   The Supabase JS client builds getPublicUrl() results from the `supabaseUrl`
 *   parameter used at client initialization. In Docker Swarm, SUPABASE_URL is set
 *   to the internal API Gateway hostname (http://kong:8000). Any URL produced by
 *   `supabase.storage.from(b).getPublicUrl(p)` therefore contains `kong:8000` —
 *   a hostname that browsers cannot resolve. This file bypasses the JS client
 *   and always builds URLs from the public-facing hostname.
 *
 * USAGE:
 *   import { getStoragePublicUrl } from "../_shared/storage-url.ts";
 *   const url = getStoragePublicUrl("avatars", storagePath);
 */

const _PUBLIC_SUPABASE_URL = (() => {
  const url =
    Deno.env.get("SELFHOSTED_SUPABASE_URL") ??
    Deno.env.get("SUPABASE_URL") ??
    "";
  return url.replace(/\/+$/, ""); // strip trailing slash
})();

/**
 * Builds the public storage URL for an object, always using the public hostname.
 * Only use for PUBLIC buckets (avatars, custom-emojis, recibos-entrega, stickers).
 * Private buckets (whatsapp-media, audio-messages) require signed URLs instead.
 */
export function getStoragePublicUrl(bucket: string, path: string): string {
  if (!bucket || !path) return "";
  const cleanPath = path.replace(/^\//, "");
  return `${_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${cleanPath}`;
}
