// @ts-nocheck
import { useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { ConversationWithMessages } from '@/features/inbox';
import { useDensity } from '@/hooks/useDensity';
import { MOCK_CONVERSATIONS } from './conversation-list/__mocks__/mockConversations';
import { ConversationItem as SharedConversationItem } from './conversation-list/ConversationItem';

// Mocks: estritamente opt-in (localStorage mockConversations='1') e apenas em
// DEV. Nunca usamos demo-fallback em produção: um inbox legitimamente vazio
// exibindo conversas falsas induz o operador a responder clientes inexistentes.
const MOCKS_FLAG =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  window.localStorage?.getItem('mockConversations') === '1';

interface VirtualizedRealtimeListProps {
  conversations: ConversationWithMessages[];
  selectedContactId: string | null;
  onSelectConversation: (contactId: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (contactId: string) => void;
  onMarkAsRead?: (contactId: string) => void;
  onArchive?: (contactId: string) => void;
  onPin?: (contactId: string) => void;
  pinnedIds?: Set<string>;
}

const ITEM_HEIGHT_NORMAL = 96; // Comfortable mode with breathing room
const ITEM_HEIGHT_COMPACT = 82; // Compact mode with clear card separation
const EMPTY_SET = new Set<string>();

const VirtualizedItem = memo(
  ({
    virtualRow,
    conversation,
    selectedContactId,
    selectedIds,
    pinnedIds,
    selectionMode,
    onToggleSelection,
    onSelectConversation,
  }: {
    virtualRow: any; // ignore-audit
    conversation: ConversationWithMessages;
    selectedContactId: string | null;
    selectedIds: Set<string>;
    pinnedIds: Set<string>;
    selectionMode: boolean;
    onToggleSelection?: (id: string) => void;
    onSelectConversation: (contactId: string) => void;
  }) => {
    const contactId = conversation.contact.id;
    const isSelected = selectedContactId === contactId;
    const isMultiSelected = selectedIds.has(contactId);
    const isPinned = pinnedIds.has(contactId);

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start}px)`,
        }}
        className="w-full"
      >
        <SharedConversationItem
          conversation={conversation}
          isSelected={isSelected}
          onSelect={() => onSelectConversation(contactId)}
          selectionMode={selectionMode}
          isMultiSelected={isMultiSelected}
          onToggleSelection={onToggleSelection}
          isPinned={isPinned}
        />
      </div>
    );
  }
);

export function VirtualizedRealtimeList({
  conversations,
  selectedContactId,
  onSelectConversation,
  selectionMode = false,
  selectedIds = EMPTY_SET,
  onToggleSelection,
  onMarkAsRead: _onMarkAsRead,
  onArchive: _onArchive,
  onPin: _onPin,
  pinnedIds = EMPTY_SET,
}: VirtualizedRealtimeListProps) {
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';
  const parentRef = useRef<HTMLDivElement>(null);

  const safeConversations = useMemo(() => {
    const hasReal = Array.isArray(conversations) && conversations.length > 0;
    const base = !hasReal && MOCKS_FLAG ? MOCK_CONVERSATIONS : conversations;
    if (!Array.isArray(base)) return [];
    return base.filter((c) => c?.contact?.id);
  }, [conversations]);

  const sortedConversations = useMemo(() => {
    const deduped: ConversationWithMessages[] = [];
    const seen = new Set<string>();

    for (const c of safeConversations) {
      if (!seen.has(c.contact.id)) {
        deduped.push(c);
        seen.add(c.contact.id);
      }
    }

    return deduped.sort((a, b) => {
      const aPin = pinnedIds.has(a.contact.id);
      const bPin = pinnedIds.has(b.contact.id);
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [safeConversations, pinnedIds]);

  const virtualizer = useVirtualizer({
    count: sortedConversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isCompact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT_NORMAL),
    overscan: 5,
  });

  if (sortedConversations.length === 0) {
    return null;
  }

  return (
    <div ref={parentRef} className="scrollbar-thin h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const conversation = sortedConversations[virtualRow.index];
          if (!conversation?.contact?.id) return null;

          return (
            <VirtualizedItem
              key={conversation.contact.id}
              virtualRow={virtualRow}
              conversation={conversation}
              selectedContactId={selectedContactId}
              selectedIds={selectedIds}
              pinnedIds={pinnedIds}
              selectionMode={selectionMode}
              onToggleSelection={onToggleSelection}
              onSelectConversation={onSelectConversation}
            />
          );
        })}
      </div>
    </div>
  );
}