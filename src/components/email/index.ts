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

export { EmailAttachmentPreview } from './EmailAttachmentPreview';
export { EmailChatBubble } from './EmailChatBubble';
export { EmailChatInbox } from './EmailChatInbox';
export { EmailChatReplyBar } from './EmailChatReplyBar';
export { EmailChatThread } from './EmailChatThread';
export { EmailSLABadge, SLADot, SLAProgressBar } from './EmailSLABadge';
export { EmailSearchBar } from './EmailSearchBar';
/** Re-exported module members. */
export { EmailThreadList } from './EmailThreadList';

// v2 variant — uses DOM-native sanitization instead of DOMPurify.
// Re-exported with a descriptive alias to make the intent explicit at call sites.
/** Re-exported module members. */
export {
  EmailChatBubble as EmailChatBubbleDOMSafe,
  EmailChatBubbleV2,
} from './EmailChatBubble-v2';
/** Re-exported module members. */
export type { EmailChatBubbleProps } from './EmailChatBubble-v2';
