// @ts-nocheck
// Round 14 Fix P6: EmailChatBubble with config-based sanitization
// Gap 3.2: Recursive component hook collision prevention

import React, { useMemo } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { sanitizeHtmlWithHooks } from '@/lib/sanitize-v2';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailChatBubble');

interface EmailChatBubbleProps {
  email?: string;
  className?: string;
}

export const EmailChatBubble: React.FC<EmailChatBubbleProps> = ({ email, className }) => {
  // Memoize sanitization to prevent re-runs on component re-render
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
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      // Safe because sanitized with config-based approach
      // No mutable hook state that could collide in recursive renders
    />
  );
};

// Alternative: Safer version using DOMParser
export const EmailChatBubbleV2: React.FC<EmailChatBubbleProps> = ({ email, className }) => {
  const sanitizedElement = useMemo(() => {
    if (!email) return null;

    try {
      // Use immutable config (no hooks)
      const sanitized = DOMPurify.sanitize(email, {
        ALLOWED_TAGS: ['p', 'br', 'a', 'b', 'i', 'em', 'strong', 'u'],
        ALLOWED_ATTR: ['href', 'title'],
        RETURN_DOM: false,
        FORCE_BODY: true,
      });

      // Parse result and apply tabnabbing prevention
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, 'text/html');

      // Prevent tabnabbing on all external links
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
      dangerouslySetInnerHTML={{ __html: sanitizedElement }}
      // Safe: config-based sanitization, no mutable global hooks
    />
  );
};

export default EmailChatBubble;
