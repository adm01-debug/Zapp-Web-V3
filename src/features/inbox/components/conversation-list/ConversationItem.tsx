import { memo } from 'react';
import { useDensity } from '@/hooks/useDensity';
import { ConversationItemCompact } from './ConversationItemCompact';
import { ConversationItemComfortable } from './ConversationItemComfortable';
import type { ConversationItemProps as SharedProps } from './conversationItemShared';

// Re-export shared symbols so existing importers don't need to change.
export {
  ChannelBadge,
  statusIcons,
  statusColors,
  type ConversationItemData,
  type ConversationItemProps,
} from './conversationItemShared';

export const ConversationItem = memo(function ConversationItem(props: SharedProps) {
  const { density } = useDensity();
  const isCompactMode = density === 'compact' || density === 'dense' || props.compact;

  if (isCompactMode) {
    return <ConversationItemCompact {...props} />;
  }
  return <ConversationItemComfortable {...props} />;
});

ConversationItem.displayName = 'ConversationItem';
