// Round 14-15 Fix: input validation, unicode normalization, DOM-based sanitization
// Gap 3.1: hook cleanup exception safety (now handled by stateless DOM sanitizer)
// Gap 6.1: sanitizeHtml() null coercion
// Gap 9.1: Unicode normalization (NFKC) + entity decoding
// Gap 9.2: HTML entity bypass prevention
// Gap 9.3: Control character detection
//
// Implementation note: uses document.implementation.createHTMLDocument for HTML parsing
// instead of DOMPurify, which behaves inconsistently across DOM environments (happy-dom,
// jsdom, real browser). The DOM API approach is deterministic in all supported environments.

// Allowed HTML elements — any tag not in this set is unwrapped (content kept, tag removed)
const ALLOWED_TAGS_SET = new Set<string>(['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a']);

// Per-element allowed attribute lists
const ALLOWED_ATTRS_MAP: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target']),
};

// Tags whose entire subtree must be removed (content is NOT preserved)
const VOID_DANGEROUS_TAGS = new Set<string>([
  'script', 'style', 'object', 'embed', 'link', 'meta', 'base',
  'iframe', 'frame', 'frameset', 'applet', 'svg', 'math',
]);

const DANGEROUS_PROTOCOL_RE = /^(javascript|data|vbscript):/i;
const EVENT_ATTR_RE = /^on/i;

// Config object kept for API compatibility (function signature uses Partial<typeof _SANITIZE_CONFIG>)
const _SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'target'],
  KEEP_CONTENT: true,
};

// Unicode normalization cache (Gap 9.1: NFKC normalization)
const normalizationCache = new Map<string, string>();

/**
 * Normalize text using NFKC form (most restrictive Unicode normalization).
 * Prevents unicode-based bypasses of sanitization rules.
 *
 * @param text - Input text to normalize
 * @returns NFKC-normalized text
 */
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
    console.warn(`[normalizeUnicodeNFKC] Normalization failed: ${err}`);
    return text;
  }
}

/**
 * Decode HTML entities that can bypass sanitization.
 * Called BEFORE sanitization to catch entity-based bypasses (Gap 9.2).
 *
 * @param html - HTML string with entities
 * @returns HTML with entities decoded
 */
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

  // Decode numeric entities (&#123;)
  decoded = decoded.replace(/&#(\d+);/g, (_match, charCode) => {
    try {
      return String.fromCharCode(parseInt(charCode, 10));
    } catch {
      return _match;
    }
  });

  // Decode hex entities (&#x7B;)
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/gi, (_match, charCode) => {
    try {
      return String.fromCharCode(parseInt(charCode, 16));
    } catch {
      return _match;
    }
  });

  return decoded;
}

/**
 * Detect and reject control characters that can bypass sanitization (Gap 9.3).
 * Rejects all C0 controls (0x00–0x1F) including tab, newline, carriage return, and DEL (0x7F).
 *
 * @param text - Text to validate
 * @throws If control characters detected
 */
function validateNoControlCharacters(text: string): void {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(text)) {
    throw new Error('Input contains invalid control characters');
  }
}

/**
 * Walk the DOM node tree, removing dangerous elements and disallowed attributes.
 * - Dangerous elements (script, svg, etc.) are removed with their entire content.
 * - Disallowed but non-dangerous elements are "unwrapped": tag removed, content kept.
 * - Allowed elements have their attributes filtered to the allowed list.
 * - Event-handler attributes (on*) are always removed.
 * - HTML comments are removed.
 */
function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 8 /* COMMENT_NODE */) {
      node.removeChild(child);
      continue;
    }
    if (child.nodeType !== 1 /* ELEMENT_NODE */) {
      continue; // Keep text nodes as-is
    }

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (VOID_DANGEROUS_TAGS.has(tag)) {
      // Remove entire element including its content
      node.removeChild(el);
      continue;
    }

    if (ALLOWED_TAGS_SET.has(tag)) {
      // Allowed element: strip disallowed and event-handler attributes
      const allowedAttrs = ALLOWED_ATTRS_MAP[tag] ?? new Set<string>();
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (EVENT_ATTR_RE.test(name) || !allowedAttrs.has(name)) {
          el.removeAttribute(attr.name);
        }
      }
      // Reject dangerous href protocols on anchor elements
      if (tag === 'a' && el.hasAttribute('href')) {
        const href = (el.getAttribute('href') ?? '').trim();
        if (DANGEROUS_PROTOCOL_RE.test(href)) {
          el.removeAttribute('href');
        }
      }
      sanitizeNode(el); // Recurse into children
    } else {
      // Disallowed (non-dangerous): unwrap — keep text content, remove element wrapper
      sanitizeNode(el); // Sanitize children before unwrapping
      while (el.firstChild) {
        node.insertBefore(el.firstChild, el);
      }
      node.removeChild(el);
    }
  }
}

/**
 * Core DOM-based HTML sanitization.
 * Uses document.implementation.createHTMLDocument for reliable parsing in browser and test environments.
 *
 * @param html - Preprocessed HTML string (already entity-decoded and unicode-normalized)
 * @param opts - Optional post-processing options
 * @returns Sanitized HTML string
 */
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

/**
 * Sanitizes HTML with strict validation and error handling.
 *
 * Pipeline: validate type → normalize unicode → decode entities → detect control chars → DOM sanitize
 *
 * @param html - Input to sanitize (must be non-null string)
 * @param _options - Reserved for API compatibility (not used by DOM sanitizer)
 * @returns SanitizeResult with success flag and sanitized HTML
 */
export function sanitizeHtml(
  html: unknown,
  _options?: Partial<typeof _SANITIZE_CONFIG>
): SanitizeResult {
  try {
    // EXPLICIT validation (Gap 6.1 - prevent null coercion)
    if (html === null || html === undefined) {
      console.error('[sanitizeHtml] Received null/undefined input');
      throw new TypeError('sanitizeHtml() requires non-null string input');
    }

    if (typeof html !== 'string') {
      console.error(`[sanitizeHtml] Received non-string: ${typeof html}`);
      throw new TypeError(
        `sanitizeHtml() expects string, received ${typeof html}`
      );
    }

    if (html.length === 0) {
      return { success: true, html: '', sanitized: false };
    }

    let processed = html;

    // Step 1: Normalize unicode using NFKC (Gap 9.1)
    processed = normalizeUnicodeNFKC(processed);

    // Step 2: Decode HTML entities before sanitization (Gap 9.2)
    processed = decodeHtmlEntities(processed);

    // Step 3: Detect and reject control characters (Gap 9.3)
    validateNoControlCharacters(processed);

    // Step 4: DOM-based sanitization
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
    console.error('[sanitizeHtml] Sanitization failed:', errorMsg);

    return {
      success: false,
      html: '',
      sanitized: false,
      error: errorMsg,
    };
  }
}

/**
 * Safe sanitization with tabnabbing prevention.
 * Adds rel="noopener noreferrer nofollow" to all target="_blank" anchors.
 *
 * @param html - HTML to sanitize
 * @returns Sanitized HTML with tabnabbing protection
 */
export function sanitizeHtmlWithHooks(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return domSanitize(html, { addNoopener: true });
}

/**
 * Backward-compatible sanitizeHtml with hook cleanup semantics.
 * Stateless DOM-based sanitizer — no mutable hook registry needed (Gap 3.1).
 *
 * @param html - HTML to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtmlWithHookCleanup(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  try {
    return domSanitize(html);
  } catch (err) {
    console.error(`[sanitizeHtmlWithHookCleanup] Error: ${err}`);
    return '';
  }
}
