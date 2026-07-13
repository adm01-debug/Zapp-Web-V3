/**
 * Email components barrel export.
 *
 * Usage:
 *   import { EmailChatThread, EmailThreadList } from '@/components/email';
 *
 * Architecture note:
 *   - EmailChatBubble (v1) renders via the main DOMPurify sanitizer (sanitize.ts).
 *   - EmailChatBubble-v2 uses the DOM-native sanitizer (from sanitize.ts v3.0)
 *     to avoid mutable DOMPurify hook collisions in recursive render trees.
 *
 *   Both sanitizers are now unified in src/lib/sanitize.ts (v3.0 consolidated sanitize + sanitize-v2).
 */

export { default as EmailAttachmentPreview } from './EmailAttachmentPreview';
export { default as EmailChatBubble } from './EmailChatBubble';
export { default as EmailChatInbox } from './EmailChatInbox';
export { default as EmailChatReplyBar } from './EmailChatReplyBar';
export { default as EmailChatThread } from './EmailChatThread';
export { default as EmailSLABadge } from './EmailSLABadge';
export { default as EmailSearchBar } from './EmailSearchBar';
export { default as EmailThreadList } from './EmailThreadList';

// v2 variant — uses DOM-native sanitization instead of DOMPurify.
// Re-exported with a descriptive alias to make the intent explicit at call sites.
export {
  EmailChatBubble as EmailChatBubbleDOMSafe,
  EmailChatBubbleV2,
} from './EmailChatBubble-v2';
export type { EmailChatBubbleProps } from './EmailChatBubble-v2';
