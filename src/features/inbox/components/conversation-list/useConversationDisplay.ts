import { useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useContactTyping } from '@/hooks/useContactTyping';
import { useInViewport } from '@/hooks/useInViewport';
import { getSentimentFromScore, type SentimentLevel } from '../SentimentIndicator';
import { toValidDate } from '@/utils/date/normalize';
import {
  type ConversationItemData,
  statusIcons,
  buildPrimaryLabel,
  buildSecondaryLabel,
} from './conversationItemShared';

/** use Conversation Display component for the conversation list section. */
export function useConversationDisplay(conversation: ConversationItemData) {
  const contact = conversation.contact;
  const contactId = contact?.id || conversation.id;
  const status = conversation.status || 'open';
  const unreadCount = conversation.unreadCount || 0;
  const lastMessage = conversation.lastMessage;
  const tags = contact?.tags ?? [];
  const avatarUrl = contact?.avatar || contact?.avatar_url;
  const companyName = contact?.company_name || contact?.company || contact?.organization;

  const displayDate =
    toValidDate(conversation.updatedAt, null) ||
    toValidDate(lastMessage?.created_at, null) ||
    toValidDate(contact?.updated_at, null) ||
    new Date();

  const StatusIcon = statusIcons[status as keyof typeof statusIcons] || AlertCircle;

  const sentiment: SentimentLevel | null =
    (conversation.sentiment as SentimentLevel | null) ||
    (conversation.sentimentScore !== undefined
      ? getSentimentFromScore(conversation.sentimentScore)
      : contact?.ai_sentiment
        ? (contact.ai_sentiment as SentimentLevel)
        : null);

  const primaryLabel = buildPrimaryLabel(conversation);
  const secondaryLabel = buildSecondaryLabel(conversation);
  const hasTags = tags.length > 0;
  const previewText = lastMessage?.content?.trim() || 'Sem mensagens ainda';
  const visibleTags = tags.slice(0, 2);

  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewport(rootRef, { rootMargin: '200px', keepVisibleMs: 1500 });
  const isTyping = useContactTyping(contactId, inView);

  return {
    contact,
    contactId,
    status,
    unreadCount,
    lastMessage,
    tags,
    avatarUrl,
    companyName,
    displayDate,
    StatusIcon,
    sentiment,
    primaryLabel,
    secondaryLabel,
    hasTags,
    previewText,
    visibleTags,
    rootRef,
    isTyping,
  };
}
