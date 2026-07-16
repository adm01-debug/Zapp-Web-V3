/**
 * sanitize.ts — v3.0 Unified
 * XSS prevention utilities combining DOMPurify and DOM-based sanitization.
 * All user input rendering MUST pass through these functions (OWASP A03:2021).
 *
 * v3.0 Consolidates sanitize.ts (v2.1) + sanitize-v2.ts (v15) into single module:
 * - sanitizeText() — DOMPurify-based plain text sanitization
 * - sanitizeHtml() — DOMPurify-based rich HTML with hook cleanup
 * - sanitizeHtmlStrict() — DOM-based strict sanitization with unicode normalization
 * - sanitizeHtmlWithHooks() — DOM-based with tabnabbing prevention
 * - sanitizeContactFields(), sanitizeUrl(), sanitizeForSearch(), sanitizePostgrestFilter()
 * - truncateText()
 */
import DOMPurify from 'dompurify';
import { getLogger } from '@/lib/logger';

const log = getLogger('sanitize');

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
  DOMPurify.addHook(HOOK_NAME as never, (node) => {
    if ((node as Element).tagName === 'A') {
      (node as Element).setAttribute('rel', 'noopener noreferrer');
      (node as Element).setAttribute('target', '_blank');
    }
  });
  let sanitized = '';
  try {
    sanitized = DOMPurify.sanitize(str, {
      ALLOWED_TAGS: RICH_ALLOWED_TAGS,
      ALLOWED_ATTR: RICH_ALLOWED_ATTR,
      // Event handlers and style are still explicitly forbidden as defense-in-depth.
      // href removed from FORBID_ATTR so <a> links in notes work; src kept because
      // <img> is not in RICH_ALLOWED_TAGS so src on any surviving element is harmless.
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
        'src',
      ],
    }).trim();
  } finally {
    DOMPurify.removeHook(HOOK_NAME as never);
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
  const resultRec = result as Record<string, unknown>; // ignore-audit: narrows Supabase query result to local interface
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
    .slice(0, 200); // safety net after escaping
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
    .replace(/[,"()]/g, '') // strip PostgREST filter metacharacters
    .replace(/\\/g, '\\\\') // escape backslash BEFORE adding other escape sequences
    .replace(/[*%_]/g, '\\$&') // escape SQL LIKE wildcards (PostgREST * is alias for %)
    .slice(0, 200); // safety net
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number, ellipsis = '…'): string {
  if (!text) return '';
  const safe = sanitizeText(text);
  return safe.length > maxLength ? safe.slice(0, maxLength) + ellipsis : safe;
}

// ── DOM-Based Sanitization (from sanitize-v2) ──────────────────────────────

const ALLOWED_TAGS_SET = new Set<string>(['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a']);
const ALLOWED_ATTRS_MAP: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target']),
};
const VOID_DANGEROUS_TAGS = new Set<string>([
  'script',
  'style',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'frameset',
  'applet',
  'svg',
  'math',
]);
const DANGEROUS_PROTOCOL_RE = /^(javascript|data|vbscript):/i;
const EVENT_ATTR_RE = /^on/i;
const normalizationCache = new Map<string, string>();

function normalizeUnicodeNFKC(text: string): string {
  if (!text) return text;
  if (normalizationCache.has(text)) {
    return normalizationCache.get(text)!;
  }
  try {
    const normalized = text.normalize('NFKC');
    if (normalizationCache.size >= 1000) {
      const firstKey = normalizationCache.keys().next().value;
      if (firstKey !== undefined) normalizationCache.delete(firstKey);
    }
    normalizationCache.set(text, normalized);
    return normalized;
  } catch (err) {
    log.warn(`[normalizeUnicodeNFKC] Normalization failed: ${err}`);
    return text;
  }
}

function decodeHtmlEntities(html: string): string {
  if (!html) return html;
  let decoded = html;
  const entityMap: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
  };
  Object.entries(entityMap).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  });
  decoded = decoded.replace(/&#(\d+);/g, (_match, charCode) => {
    try {
      return String.fromCharCode(parseInt(charCode, 10));
    } catch {
      return _match;
    }
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/gi, (_match, charCode) => {
    try {
      return String.fromCharCode(parseInt(charCode, 16));
    } catch {
      return _match;
    }
  });
  return decoded;
}

function validateNoControlCharacters(text: string): void {
  if (/[\x00-\x1F\x7F]/.test(text)) {
    throw new Error('Input contains invalid control characters');
  }
}

function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 8 /* COMMENT_NODE */) {
      node.removeChild(child);
      continue;
    }
    if (child.nodeType !== 1 /* ELEMENT_NODE */) {
      continue;
    }
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (VOID_DANGEROUS_TAGS.has(tag)) {
      node.removeChild(el);
      continue;
    }
    if (ALLOWED_TAGS_SET.has(tag)) {
      const allowedAttrs = ALLOWED_ATTRS_MAP[tag] ?? new Set<string>();
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (EVENT_ATTR_RE.test(name) || !allowedAttrs.has(name)) {
          el.removeAttribute(attr.name);
        }
      }
      if (tag === 'a' && el.hasAttribute('href')) {
        const href = (el.getAttribute('href') ?? '').trim();
        if (DANGEROUS_PROTOCOL_RE.test(href)) {
          el.removeAttribute('href');
        }
      }
      sanitizeNode(el);
    } else {
      sanitizeNode(el);
      while (el.firstChild) {
        node.insertBefore(el.firstChild, el);
      }
      node.removeChild(el);
    }
  }
}

function domSanitize(html: string, opts?: { addNoopener?: boolean }): string {
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  sanitizeNode(doc.body);
  if (opts?.addNoopener) {
    doc.body.querySelectorAll('a[target="_blank"]').forEach((link) => {
      link.setAttribute('rel', 'noopener noreferrer nofollow');
    });
  }
  return doc.body.innerHTML;
}

export interface SanitizeResult {
  success: boolean;
  html: string;
  sanitized: boolean;
  error?: string;
}

export function sanitizeHtmlStrict(
  html: unknown,
  _options?: Record<string, unknown>
): SanitizeResult {
  try {
    if (html === null || html === undefined) {
      log.error('[sanitizeHtmlStrict] Received null/undefined input');
      throw new TypeError('sanitizeHtmlStrict() requires non-null string input');
    }
    if (typeof html !== 'string') {
      log.error(`[sanitizeHtmlStrict] Received non-string: ${typeof html}`);
      throw new TypeError(`sanitizeHtmlStrict() expects string, received ${typeof html}`);
    }
    if (html.length === 0) {
      return { success: true, html: '', sanitized: false };
    }
    let processed = html;
    processed = normalizeUnicodeNFKC(processed);
    processed = decodeHtmlEntities(processed);
    validateNoControlCharacters(processed);
    const sanitized = domSanitize(processed);
    if (typeof sanitized !== 'string') {
      throw new Error('Sanitization returned invalid result');
    }
    return {
      success: true,
      html: sanitized,
      sanitized: html !== sanitized,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('[sanitizeHtmlStrict] Sanitization failed:', errorMsg);
    return {
      success: false,
      html: '',
      sanitized: false,
      error: errorMsg,
    };
  }
}

export function sanitizeHtmlWithHooks(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  return domSanitize(html, { addNoopener: true });
}

export function sanitizeHtmlWithHookCleanup(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  try {
    return domSanitize(html);
  } catch (err) {
    log.error(`[sanitizeHtmlWithHookCleanup] Error: ${err}`);
    return '';
  }
}
