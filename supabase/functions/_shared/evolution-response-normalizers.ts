/**
 * Normalizers for Evolution API responses that historically have inconsistent
 * shapes between v2.3.7 endpoints and the Evolution DB RPC fallback.
 *
 * These helpers guarantee a deterministic return contract regardless of the
 * upstream payload shape (array, wrapped object, null, undefined, missing
 * fields). Used by `find-chats`, `find-contacts` and `fetch-profile` actions
 * in the `evolution-api` edge function so primary and fallback paths emit the
 * same shape.
 *
 * Contract:
 *   - normalizeChatList(...)    → unknown[] (always an array)
 *   - normalizeContactList(...) → unknown[] (always an array)
 *   - normalizeProfile(...)     → object | null
 */

/** Coerce any of the known list payload shapes into a plain array. */
export function normalizeChatList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.records)) return d.records as unknown[];
    const chats = d.chats;
    if (Array.isArray(chats)) return chats as unknown[];
    if (chats && typeof chats === 'object' && Array.isArray((chats as Record<string, unknown>).records)) {
      return (chats as Record<string, unknown>).records as unknown[];
    }
  }
  return [];
}

/** Same as `normalizeChatList` but inspects `contacts` instead of `chats`. */
export function normalizeContactList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.records)) return d.records as unknown[];
    const contacts = d.contacts;
    if (Array.isArray(contacts)) return contacts as unknown[];
    if (contacts && typeof contacts === 'object' && Array.isArray((contacts as Record<string, unknown>).records)) {
      return (contacts as Record<string, unknown>).records as unknown[];
    }
  }
  return [];
}

/**
 * Coerce any of the known profile payload shapes into a single object or null.
 *
 * Strips the proxy `version` envelope marker before deciding emptiness so an
 * upstream `{}` (or `{ version: 1 }` after the proxy stamp) is treated as
 * "no profile" → `null` instead of leaking the marker as a fake profile.
 */
export function normalizeProfile(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.profile && typeof d.profile === 'object' && !Array.isArray(d.profile)) {
    return d.profile as Record<string, unknown>;
  }
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
    return d.data as Record<string, unknown>;
  }
  const meaningfulKeys = Object.keys(d).filter((k) => k !== 'version');
  return meaningfulKeys.length > 0 ? d : null;
}
