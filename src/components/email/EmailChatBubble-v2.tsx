// Round 14 Fix P6: EmailChatBubble with config-based sanitization
// Gap 3.2: Recursive component hook collision prevention
//
// NOTE: This file uses the DOM-native sanitizer (sanitize-v2.ts) instead of DOMPurify
// to avoid mutable global hook collisions when this component is used recursively.
// See docs/sanitize-architecture.md for the full explanation.
//
// DEPENDENCY FIX (2026-07-13): Replaced 'isomorphic-dompurify' (not in package.json)
// with 'dompurify' (already a production dependency) in EmailChatBubbleV2.

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { sanitizeHtmlWithHooks } from '@/lib/sanitize-v2';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailChatBubble');

/** Props shared by both EmailChatBubble variants. */
export interface EmailChatBubbleProps {
  /** Raw HTML e-mail body. Will be sanitized before rendering. */
  email?: string;
  /** Additional CSS class applied to the wrapper div. */
  className?: string;
}

/**
 * `EmailChatBubble` — renders sanitized HTML e-mail content.
 *
 * Uses the DOM-native sanitizer (`sanitize-v2.ts`) for hook-collision safety
 * in recursive render trees. Prefer this variant when the component may be
 * rendered inside another component that also calls DOMPurify with hooks.
 *
 * @see docs/sanitize-architecture.md
 */
export const EmailChatBubble: React.FC<EmailChatBubbleProps> = ({ email, className }) => {
  // Memoize sanitization to avoid re-runs on unrelated re-renders.
  const sanitizedHtml = useMemo(() => {
    if (!email) return '';

    try {
      return sanitizeHtmlWithHooks(email);
    } catch (err) {
      log.error('Email sanitization failed:', err);
      return '';
    }
  }, [email]);

  if (!sanitizedHtml) {
    return <div className={className}>No email content</div>;
  }

  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      // Safe: sanitized with DOM-native config-based approach.
      // No mutable hook state that could collide in recursive renders.
    />
  );
};

/**
 * `EmailChatBubbleV2` — alternative variant using DOMPurify + DOMParser.
 *
 * Use this when you need explicit control over `ALLOWED_TAGS`/`ALLOWED_ATTR`
 * or when tabnabbing prevention must run via DOMParser (rather than the DOM
 * walker in `sanitize-v2.ts`).
 *
 * @see docs/sanitize-architecture.md
 */
export const EmailChatBubbleV2: React.FC<EmailChatBubbleProps> = ({ email, className }) => {
  const sanitizedElement = useMemo(() => {
    if (!email) return null;

    try {
      // Immutable DOMPurify config — no hooks, no mutable global state.
      const sanitized = DOMPurify.sanitize(email, {
        ALLOWED_TAGS: ['p', 'br', 'a', 'b', 'i', 'em', 'strong', 'u'],
        ALLOWED_ATTR: ['href', 'title'],
        RETURN_DOM: false,
        FORCE_BODY: true,
      }) as string;

      // Parse result and apply tabnabbing prevention to all external links.
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, 'text/html');

      doc.querySelectorAll('a').forEach((link) => {
        if (link.hasAttribute('href')) {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      });

      return doc.body.innerHTML;
    } catch (err) {
      log.error('Email rendering failed:', err);
      return '';
    }
  }, [email]);

  if (!sanitizedElement) {
    return <div className={className}>No email content</div>;
  }

  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: sanitizedElement }}
      // Safe: config-based sanitization, no mutable global hooks.
    />
  );
};

export default EmailChatBubble;
