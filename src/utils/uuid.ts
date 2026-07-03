/**
 * UUID validation utilities.
 *
 * PostgreSQL uuid columns reject non-UUID strings with a 400 error:
 *   "invalid input syntax for type uuid"
 *
 * WhatsApp JIDs (e.g. "551146375517@s.whatsapp.net" or just "551146375517")
 * are phone numbers — NOT UUIDs — and must be screened out before any
 * PostgREST query that filters on a uuid column (contact_id, sender_id, etc).
 *
 * Usage:
 *   import { isValidUUID } from '@/utils/uuid';
 *   if (!isValidUUID(contactId)) return; // skip DB query
 */

/** RFC 4122 UUID regex (case-insensitive). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns `true` if `value` is a valid RFC 4122 UUID string.
 * Returns `false` for null, undefined, empty strings, phone numbers,
 * WhatsApp JIDs, or any other non-UUID format.
 */
export function isValidUUID(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_REGEX.test(value);
}
