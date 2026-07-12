/**
 * sanitize.ts — v2.1
 * XSS prevention utilities using DOMPurify (OWASP A03:2021).
 * All user input rendering MUST pass through these functions.
 *
 * Updated in v2.1:
 * - sanitizeContactFields() now maps evolution_contacts field names
 * - truncateText() utility added
 * - sanitizeForSearch() added (safe for DB query building)
 */
import DOMPurify from 'dompurify';

// ── Allowed HTML for rich content ──────────────────────────────────────────

const RICH_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'ul', 'ol', 'li', 'span'];
const RICH_ALLOWED_ATTR: string[] = []; // no attributes allowed (prevents style/event injection)

// ── Core functions ─────────────────────────────────────────────────────────

/**
 * Sanitize plain text — strips ALL HTML tags.
 * Use for: names, phones, emails, companies, tags, any plain field.
 */
export function sanitizeText(input: unknown): string {
  if (input === null || input === undefined) return '';
  const str = typeof input === 'string' ? input : String(input);
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * Sanitize rich HTML — allows safe formatting tags only.
 * Use for: notes, descriptions, internal comments.
 * Blocks: scripts, iframes, event handlers, style attributes.
 */
export function sanitizeHtml(html: unknown): string {
  if (!html) return '';
  const str = typeof html === 'string' ? html : String(html);
  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: RICH_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_ALLOWED_ATTR,
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onchange',
      'onsubmit',
      'style',
      'href',
      'src',
    ],
  }).trim();
}

/**
 * Sanitize a complete evolution_contacts record.
 * Plain text on all text fields; rich text only on notes.
 */
export function sanitizeContactFields<T extends Record<string, unknown>>(contact: T): T {
  const result = { ...contact };

  // Plain text fields (evolution_contacts schema)
  const textFields = [
    'full_name',
    'push_name',
    'phone_number',
    'email',
    'company',
    'role_title',
    'assigned_to',
    'lead_status',
    'instance_name',
    'remote_jid',
    // Generic aliases (for compatibility)
    'name',
    'phone',
    'address',
    'city',
    'state',
    'country',
    'channel',
  ];

  // Rich HTML fields (only notes)
  const richFields = ['notes', 'description'];

  for (const field of textFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      result[field as keyof T] = sanitizeText(result[field]) as T[keyof T];
    }
  }

  for (const field of richFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      result[field as keyof T] = sanitizeHtml(result[field]) as T[keyof T];
    }
  }

  // Sanitize tags array
  const resultRec = result as Record<string, unknown>;
  if (Array.isArray(resultRec.tags)) {
    resultRec.tags = (resultRec.tags as string[]).map(sanitizeText).filter(Boolean);
  }

  return result;
}

/**
 * Sanitize a URL — only allows http/https/mailto/tel.
 * Prevents javascript: and data: protocol injection.
 */
export function sanitizeUrl(url: unknown): string {
  if (!url) return '';
  const str = sanitizeText(url);
  if (/^https?:\/\//i.test(str)) return str;
  if (/^mailto:/i.test(str)) return str;
  if (/^tel:/i.test(str)) return str;
  return ''; // reject all others (javascript:, data:, vbscript:, etc.)
}

/**
 * Sanitize text for use in search queries.
 * Removes characters that could affect query behavior.
 */
export function sanitizeForSearch(input: unknown): string {
  if (!input) return '';
  return sanitizeText(input)
    .replace(/[%_\\]/g, '\\$&') // escape SQL LIKE special chars
    .slice(0, 200); // max 200 chars for search
}

/**
 * Sanitize a value for use in a PostgREST filter expression (e.g. `.or()` ilike).
 * Strips XSS AND removes `"` and `\` so callers can safely wrap the value in
 * double-quotes inside the filter string without introducing injection vectors.
 * Does NOT escape LIKE wildcards — use sanitizeForSearch() when adding `%` internally.
 */
export function sanitizePostgrestFilter(input: unknown): string {
  if (!input) return '';
  return sanitizeText(input)
    .replace(/["\\\(\)]/g, '') // strip chars that break PostgREST quoted filter values
    .slice(0, 200);
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number, ellipsis = '…'): string {
  if (!text) return '';
  const safe = sanitizeText(text);
  return safe.length > maxLength ? safe.slice(0, maxLength) + ellipsis : safe;
}
