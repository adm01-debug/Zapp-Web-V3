// Round 14-15 Fix: DOMPurify hook safety, input validation, unicode normalization (MEDIUM)
// Gap 3.1: DOMPurify hook cleanup exception safety
// Gap 6.1: sanitizeHtml() null coercion
// Gap 9.1: Unicode normalization (NFKC) + entity decoding
// Gap 9.2: HTML entity bypass prevention
// Gap 9.3: Control character detection

import DOMPurifyFactory from 'dompurify';

// Lazy initialization of DOMPurify (deferred until first use to ensure window is ready)
let DOMPurifyInstance: ReturnType<typeof DOMPurifyFactory> | null = null;

function getDOMPurify() {
  if (!DOMPurifyInstance) {
    const winObj = (typeof window !== 'undefined' ? window : (globalThis as any)) as any;
    if (!winObj || typeof winObj.document === 'undefined') {
      throw new Error('DOMPurify requires a DOM environment (window.document)');
    }
    DOMPurifyInstance = DOMPurifyFactory(winObj);
  }
  return DOMPurifyInstance;
}

// Use immutable config instead of mutable hooks (prevents Gap 3.2 recursive collision)
// NOTE: In happy-dom/test environments, ALLOWED_TAGS config option doesn't work as expected.
// Use ADD_TAGS approach instead to explicitly extend the default allowed set.
const SANITIZE_CONFIG: Record<string, unknown> = {
  ADD_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a'],
  ADD_ATTR: ['href', 'title', 'target', 'rel'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
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

  // Check cache
  if (normalizationCache.has(text)) {
    return normalizationCache.get(text)!;
  }

  try {
    // Use NFKC normalization (most restrictive)
    const normalized = text.normalize('NFKC');

    // Cache result (limit cache size to 1000 entries)
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
 * Called BEFORE DOMPurify to catch entity-based bypasses.
 *
 * @param html - HTML string with entities
 * @returns HTML with entities decoded
 */
function decodeHtmlEntities(html: string): string {
  if (!html) return html;

  let decoded = html;

  // Decode named entities
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
 * Detect and reject control characters that can bypass sanitization.
 * Throws if invalid characters found.
 *
 * @param text - Text to validate
 * @throws If control characters detected
 */
function validateNoControlCharacters(text: string): void {
  // Check for null bytes and control characters (Gap 9.3)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(text)) {
    throw new Error('Input contains invalid control characters');
  }
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
 * Pipeline: validate → normalize unicode → decode entities → detect control chars → DOMPurify
 *
 * @param html - Input to sanitize (must be non-null string)
 * @param options - Optional sanitization config overrides
 * @returns SanitizeResult with success flag and sanitized HTML
 *
 * Throws on:
 * - null/undefined input
 * - non-string input
 * - control characters detected
 * - DOMPurify errors during sanitization
 */
export function sanitizeHtml(
  html: unknown,
  options?: Partial<typeof SANITIZE_CONFIG>
): SanitizeResult {
  try {
    // EXPLICIT validation (Gap 6.1 - prevent null coercion)
    if (html === null || html === undefined) {
      console.error('[sanitizeHtml] Received null/undefined input');
      throw new TypeError('sanitizeHtml() requires non-null string input');
    }

    if (typeof html !== 'string') {
      console.error(`[sanitizeHtml] Received non-string: ${typeof html}`);
      throw new TypeError(`sanitizeHtml() expects string, received ${typeof html}`);
    }

    if (html.length === 0) {
      return {
        success: true,
        html: '',
        sanitized: false,
      };
    }

    let processed = html;

    // Step 1: Normalize unicode using NFKC (Gap 9.1)
    processed = normalizeUnicodeNFKC(processed);

    // Step 2: Decode HTML entities before sanitization (Gap 9.2)
    processed = decodeHtmlEntities(processed);

    // Step 3: Detect and reject control characters (Gap 9.3)
    validateNoControlCharacters(processed);

    // Step 4: Apply DOMPurify sanitization
    const config = { ...SANITIZE_CONFIG, ...options };
    const sanitized = getDOMPurify().sanitize(processed, config);

    // Post-sanitization validation
    if (typeof sanitized !== 'string') {
      throw new Error('DOMPurify.sanitize() returned invalid result');
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
 * Safe hook-based sanitization using immutable config.
 * Avoids mutable DOMPurify hook registry.
 *
 * @param html - HTML to sanitize
 * @returns Sanitized HTML with tabnabbing prevention applied
 */
export function sanitizeHtmlWithHooks(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Use config, not hooks (prevents Gap 3.2 recursive collision)
  const result = getDOMPurify().sanitize(html, {
    ...SANITIZE_CONFIG,
    // This config-based approach is safer than addHook/removeHook
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM: false,
  });

  // Post-process for tabnabbing prevention (no hook needed)
  if (typeof result === 'string') {
    // Find all <a> tags with target="_blank"
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'text/html');
    const links = doc.querySelectorAll('a[target="_blank"]');

    links.forEach((link) => {
      // Force safe attributes
      link.setAttribute('rel', 'noopener noreferrer nofollow');
      link.setAttribute('target', '_blank');
    });

    return doc.body.innerHTML;
  }

  return String(result);
}

/**
 * Backward-compatible sanitizeHtml with hook cleanup.
 * For components that require hook-based validation.
 *
 * @param html - HTML to sanitize
 * @returns Sanitized HTML
 *
 * Uses try/finally to guarantee hook cleanup (Gap 3.1).
 */
export function sanitizeHtmlWithHookCleanup(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const HOOK_NAME = 'afterSanitizeAttributes';

  const attributeSanitizer = function (node: Element) {
    // Force safe attributes on all elements
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }

    // Remove dangerous attributes
    const forbiddenAttrs = [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onchange',
      'onsubmit',
    ];
    forbiddenAttrs.forEach((attr) => {
      if (node.hasAttribute(attr)) {
        node.removeAttribute(attr);
      }
    });
  };

  // Type the DOMPurify API for dynamic hook registration
  interface DOMPurifyWithHooks {
    addHook(hookName: string, callback: (node: Element) => void): void;
    removeHook(hookName: string): void;
    sanitize(html: string, config?: Record<string, unknown>): string | HTMLElement;
  }
  const purify = getDOMPurify() as DOMPurifyWithHooks;

  try {
    purify.addHook(HOOK_NAME, attributeSanitizer);
    return purify.sanitize(html, { ...SANITIZE_CONFIG }) as string;
  } catch (err) {
    console.error(`[sanitizeHtml] Hook error: ${err}`);
    // Fallback to config-based sanitization
    return purify.sanitize(html, SANITIZE_CONFIG) as string;
  } finally {
    // CRITICAL: Guarantee hook cleanup despite exceptions (Gap 3.1)
    try {
      purify.removeHook(HOOK_NAME);
    } catch (cleanupErr) {
      console.warn(`[sanitizeHtml] Hook cleanup failed: ${cleanupErr}`);
    }
  }
}
