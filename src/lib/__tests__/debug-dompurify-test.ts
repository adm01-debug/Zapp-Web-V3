// @ts-nocheck
import { describe, test, expect } from 'vitest';
import { sanitizeHtml } from '../sanitize-v2';
import DOMPurifyFactory from 'dompurify';

describe('Debug DOMPurify behavior', () => {
  test('Debug: Check what config DOMPurify receives', () => {
    // Test with direct DOMPurify in happy-dom environment
    const win: typeof window | undefined = (
      globalThis as typeof globalThis & { window?: typeof window }
    ).window;
    if (!win) {
      throw new Error('No window object available');
    }

    const DOMPurify = DOMPurifyFactory(win);

    const config = {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a'],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    };

    const input = '<b>bold</b>';
    const output = DOMPurify.sanitize(input, config);

    expect(output).toBe('<b>bold</b>');
  });

  test('Debug: Compare with sanitizeHtml function', () => {
    const result = sanitizeHtml('<b>bold</b>');
    expect(result.success).toBe(true);
    expect(result.html).toBe('<b>bold</b>');
  });
});