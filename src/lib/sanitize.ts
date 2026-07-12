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

const RICH_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'ul', 'ol', 'li', 'span', 'a'];
// href/rel/target allowed only on <a>; all other attrs rejected by whitelist
const RICH_ALLOWED_ATTR = ['href', 'rel', 'target'];

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
  // Use a DOM hook to enforce rel/target on every <a> before DOMPurify serialises
  // the output. The hook runs on the live Element, not the serialised HTML string,
  // so it is immune to the "> in query-string" regex-splitting bug.
  // CRITICAL: Use a unique hook name to prevent collision with other sanitizeHtml
  // functions (e.g. EmailChatBubble.tsx). DOMPurify.removeHook() removes by array
  // position, not by reference; if multiple hooks are active, removeHook pops the
  // wrong one and leaves orphaned hooks active.
  const HOOK_NAME = 'afterSanitizeAttributes_sanitizeHtml';
  DOMPurify.addHook(HOOK_NAME, (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
  });
  let sanitized = '';
  try {
    sanitized = DOMPurify.sanitize(str, {
      ALLOWED_TAGS:  RICH_ALLOWED_TAGS,
      ALLOWED_ATTR:  RICH_ALLOWED_ATTR,
      // Event handlers and style are still explicitly forbidden as defense-in-depth.
      // href removed from FORBID_ATTR so <a> links in notes work; src kept because
      // <img> is not in RICH_ALLOWED_TAGS so src on any surviving element is harmless.
      FORBID_ATTR:   ['onerror','onload','onclick','onmouseover','onfocus','onblur','onchange','onsubmit','style','src'],
    }).trim();
  } finally {
    DOMPurify.removeHook(HOOK_NAME);
  }
  return sanitized;
}

/**
 * Sanitize a complete evolution_contacts record.
 * Plain text on all text fields; rich text only on notes.
 */
export function sanitizeContactFields<T extends Record<string, unknown>>(contact: T): T {
  const result = { ...contact };

  // Plain text fields (evolution_contacts schema)
  const textFields = [
    'full_name', 'push_name', 'phone_number', 'email', 'company', 'role_title',
    'assigned_to', 'lead_status', 'instance_name', 'remote_jid',
    // Generic aliases (for compatibility)
    'name', 'phone', 'address', 'city', 'state', 'country', 'channel',
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
  const raw = (typeof input === 'string' ? input : String(input)).slice(0, 200);
  return sanitizeText(raw)
    .replace(/[%_\\]/g, '\\$&') // escape SQL LIKE special chars
    .slice(0, 200);              // safety net after escaping
}

/**
 * Sanitize user input for safe interpolation inside PostgREST .or() filter strings.
 *
 * PostgREST parses .or() arguments as a comma-separated list of filter expressions.
 * Without escaping, a user supplying `,phone.eq.admin` as their search term would
 * inject an extra filter clause, bypassing intended query logic.
 *
 * Characters stripped:
 *   , → separates clauses in .or()
 *   ( ) → enable grouped sub-filters
 *   " → string quoting in PostgREST filter syntax
 *
 * Characters escaped:
 *   \ → doubled to \\ so it is literal in SQL LIKE (must be escaped first)
 *   * % _ → prefixed with \ to suppress LIKE wildcard behaviour
 */
export function sanitizePostgrestFilter(input: unknown): string {
  if (!input) return '';
  // Truncate raw input BEFORE DOMPurify so it processes at most 100 chars (limits attack surface).
  // Worst-case expansion after escape chains: 2× → 200 chars; final .slice is a safety net.
  const raw = (typeof input === 'string' ? input : String(input)).slice(0, 100);
  return sanitizeText(raw)
    .replace(/[,"()]/g, '')          // strip PostgREST filter metacharacters
    .replace(/\\/g, '\\\\')         // escape backslash BEFORE adding other escape sequences
    .replace(/[*%_]/g, '\\$&')     // escape SQL LIKE wildcards (PostgREST * is alias for %)
    .slice(0, 200);                  // safety net
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number, ellipsis = '…'): string {
  if (!text) return '';
  const safe = sanitizeText(text);
  return safe.length > maxLength ? safe.slice(0, maxLength) + ellipsis : safe;
}
