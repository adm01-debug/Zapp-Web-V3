/**
 * ContactRef — canonical layer for contact identifiers.
 *
 * A contact identifier in the inbox can be either:
 * - **UUID** — internal database primary key (e.g. `"f47ac10b-58cc-4372-a567-0e02b2c3d479"`)
 * - **JID** — WhatsApp remote JID (e.g. `"551146375517@s.whatsapp.net"`)
 *
 * `resolveContactRef` distinguishes the two at runtime using an RFC 4122 UUID regex
 * and a set of known WhatsApp JID suffixes.
 *
 * Usage:
 * ```ts
 * import { resolveContactRef } from '@/features/inbox/utils/contactRef';
 *
 * const ref = resolveContactRef(contactId);
 * if (!ref) return;                // null/undefined/empty
 * if (ref.type === 'uuid') { … }   // safe for uuid columns
 * if (ref.type === 'jid')  { … }   // use ref.phone for API calls
 * ```
 */

export interface UuidRef {
  type: 'uuid';
  value: string;
}

export interface JidRef {
  type: 'jid';
  value: string;
  /** Phone digits extracted from the JID (suffix stripped). */
  phone: string;
}

export type ContactRef = UuidRef | JidRef;

/** Known WhatsApp JID suffixes used to detect JID strings. */
export const JID_SUFFIXES = ['@s.whatsapp.net', '@g.us', '@lid', '@broadcast'] as const;

/**
 * Strict RFC 4122 UUID regex (version nibble 1‑8, variant nibble 8/9/a/b).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Regex that matches any known WhatsApp JID suffix at the end of a string. */
const JID_SUFFIX_RE = /@(s\.whatsapp\.net|g\.us|lid|broadcast)$/i;

/**
 * Return the phone number portion of a JID by stripping the known suffix.
 * If no known suffix is found, returns digits-only fallback.
 */
export function derivePhone(jid: string): string {
  const match = JID_SUFFIX_RE.exec(jid);
  if (match) {
    return jid.slice(0, match.index);
  }
  // Fallback: strip everything except digits
  return jid.replace(/\D/g, '');
}

/**
 * Check whether a JID represents a group conversation.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Resolve a raw contact identifier to a typed `ContactRef`.
 *
 * - Returns `null` when `raw` is null, undefined, or empty.
 * - Returns `{ type: 'uuid', value }` when the string matches RFC 4122.
 * - Returns `{ type: 'jid', value, phone }` for WhatsApp JIDs.
 *
 * The function does **not** validate that a JID has a known suffix — any non-UUID
 * non-empty string is returned as a JID, since the inbox commonly encounters
 * bare phone numbers and legacy identifiers.
 */
export function resolveContactRef(raw: string | null | undefined): ContactRef | null {
  if (!raw) return null;

  if (UUID_RE.test(raw)) {
    return { type: 'uuid', value: raw };
  }

  return {
    type: 'jid',
    value: raw,
    phone: derivePhone(raw),
  };
}
