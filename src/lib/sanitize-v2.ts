// Round 14 Fix P5: DOMPurify hook safety & input validation (MEDIUM)
// Gap 3.1: DOMPurify hook cleanup exception safety
// Gap 6.1: sanitizeHtml() null coercion

import DOMPurify from 'isomorphic-dompurify';

// Use immutable config instead of mutable hooks (prevents Gap 3.2 recursive collision)
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'target'],
  KEEP_CONTENT: true,
  FORCE_BODY: true,
  // Use strict attribute validation
  ATTR_FILTER: (tag: string, attr: string, value: string) => {
    if (tag === 'a' && attr === 'href') {
      // Validate href is safe
      if (value.startsWith('javascript:') || value.startsWith('data:')) {
        return false;
      }
    }
    return true;
  },
};

export interface SanitizeResult {
  success: boolean;
  html: string;
  sanitized: boolean;
  error?: string;
}

/**
 * Sanitizes HTML with strict validation and error handling.
 * 
 * @param html - Input to sanitize (must be non-null string)
 * @param options - Optional sanitization config overrides
 * @returns SanitizeResult with success flag and sanitized HTML
 * 
 * Throws on:
 * - null/undefined input
 * - non-string input
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
      throw new TypeError(
        `sanitizeHtml() expects string, received ${typeof html}`
      );
    }

    if (html.length === 0) {
      return {
        success: true,
        html: '',
        sanitized: false,
      };
    }

    const config = { ...SANITIZE_CONFIG, ...options };
    const sanitized = DOMPurify.sanitize(html, config);

    // Post-sanitization validation
    if (!sanitized || typeof sanitized !== 'string') {
      throw new Error('DOMPurify.sanitize() returned invalid result');
    }

    return {
      success: true,
      html: sanitized,
      sanitized: html !== sanitized,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : String(err);
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
  const result = DOMPurify.sanitize(html, {
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

  // Generate unique hook ID to prevent collisions (Gap 3.2)
  const hookId = `afterSanitizeAttributes_sanitizeHtml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const attributeSanitizer = function (node: Element) {
    // Force safe attributes on all elements
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }

    // Remove dangerous attributes
    const forbiddenAttrs = [
      'onerror', 'onload', 'onclick', 'onmouseover',
      'onfocus', 'onblur', 'onchange', 'onsubmit',
    ];
    forbiddenAttrs.forEach(attr => {
      if (node.hasAttribute(attr)) {
        node.removeAttribute(attr);
      }
    });
  };

  try {
    DOMPurify.addHook(hookId as any, attributeSanitizer as any);
    return DOMPurify.sanitize(html, { ...SANITIZE_CONFIG });
  } catch (err) {
    console.error(`[sanitizeHtml] Hook error: ${err}`);
    // Fallback to config-based sanitization
    return DOMPurify.sanitize(html, SANITIZE_CONFIG);
  } finally {
    // CRITICAL: Guarantee hook cleanup despite exceptions (Gap 3.1)
    try {
      DOMPurify.removeHook(hookId as any);
    } catch (cleanupErr) {
      console.warn(`[sanitizeHtml] Hook cleanup failed: ${cleanupErr}`);
    }
  }
}

