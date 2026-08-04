import { useRef, useMemo, memo, useCallback, useEffect, useState } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';

import { ConversationWithMessages } from '@/features/inbox';
import { useDensity } from '@/hooks/useDensity';
import type { CRMBatchResult } from '@/hooks/useExternalContact360Batch';
import { MOCK_CONVERSATIONS } from './conversation-list/__mocks__/mockConversations';
import { ConversationItem as SharedConversationItem } from './conversation-list/ConversationItem';
import type { ConversationItemData } from './conversation-list/conversationItemShared';
import { ConversationContextMenu } from './ConversationContextMenu';

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
  /** PR PR 773: toggle real arquivar/desarquivar (recebe o estado atual do item). */
  onToggleArchive?: (contactId: string, isArchived: boolean) => void;
  onPin?: (contactId: string) => void;
  pinnedIds?: Set<string>;
  /** F4-01: scroll infinito — chamado quando o sentinel do fim da lista entra na viewport. */
  onLoadMore?: () => void;
  /** F4-01: se ainda existem páginas de conversas para carregar. */
  hasMore?: boolean;
  /** F4-01: se um load-more está em andamento. */
  loadingMore?: boolean;
  /**
   * Lazy-load contact360: reporta os phones das conversas atualmente DENTRO do
   * viewport (sem overscan). O pai deve alimentar useExternalContact360Batch
   * com essa lista para que a busca batch só dispare para contatos visíveis.
   * Só é chamado quando o conjunto de phones visíveis muda.
   */
  onVisiblePhonesChange?: (phones: string[]) => void;
  /**
   * Lookup do resultado do batch contact360 (useExternalContact360Batch.lookup).
   * Enriquece company_name dos itens visíveis quando o contato não o possui.
   */
  getCRMData?: (phone: string) => CRMBatchResult | undefined;
}

const ITEM_HEIGHT_NORMAL = 96; // Comfortable mode with breathing room
const ITEM_HEIGHT_COMPACT = 82; // Compact mode with clear card separation
const EMPTY_SET = new Set<string>();

function toConversationItemData(
  conversation: ConversationWithMessages,
  getCRMData?: (phone: string) => CRMBatchResult | undefined
): ConversationItemData {
  const phone = conversation.contact.phone;
  const crmData = phone && getCRMData ? getCRMData(phone) : undefined;
  // ConversationContact não expõe company_name (usa `company`); o item da
  // lista (ConversationItemData) prefere company_name → enriquece quando o
  // contato não tem nome de empresa próprio.
  const contactCompanyName = (conversation.contact as { company_name?: string | null }).company_name;
  const contact =
    crmData?.company_name && !contactCompanyName
      ? { ...conversation.contact, company_name: crmData.company_name }
      : conversation.contact;

  return {
    id: conversation.contact.id,
    contact,
    unreadCount: conversation.unreadCount,
    lastMessage: conversation.lastMessage
      ? {
          id: conversation.lastMessage.id,
          content: conversation.lastMessage.content,
          created_at: conversation.lastMessage.created_at,
          sender: conversation.lastMessage.sender,
          status: conversation.lastMessage.status,
          retry_attempt: conversation.lastMessage.retry_attempt,
          retry_total: conversation.lastMessage.retry_total,
        }
      : null,
    updatedAt: conversation.contact.updated_at,
    createdAt: conversation.contact.created_at,
    assignedTo: conversation.contact.assigned_to,
    tags: conversation.contact.tags,
    priority: 'medium',
    // Contrato com realtimeUtils.buildConversation (outro worker): `isArchived`
    // chega no ConversationWithMessages derivado de contact.deleted_at.
    // Cast temporário — o tipo upstream ainda não expõe o campo neste checkout.
    isArchived: Boolean((conversation as { isArchived?: boolean }).isArchived),
  };
}

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
    onMarkAsRead,
    onToggleArchive,
    onPin,
    getCRMData,
  }: {
    virtualRow: VirtualItem;
    conversation: ConversationWithMessages;
    selectedContactId: string | null;
    selectedIds: Set<string>;
    pinnedIds: Set<string>;
    selectionMode: boolean;
    onToggleSelection?: (id: string) => void;
    onSelectConversation: (contactId: string) => void;
    onMarkAsRead?: (contactId: string) => void;
    onToggleArchive?: (contactId: string, isArchived: boolean) => void;
    onPin?: (contactId: string) => void;
    getCRMData?: (phone: string) => CRMBatchResult | undefined;
  }) => {
    const contactId = conversation.contact.id;
    const isSelected = selectedContactId === contactId;
    const isMultiSelected = selectedIds.has(contactId);
    const isPinned = pinnedIds.has(contactId);
    const handleSelect = useCallback(() => {
      onSelectConversation(contactId);
      onMarkAsRead?.(contactId);
    }, [onSelectConversation, onMarkAsRead, contactId]);

    const itemData = toConversationItemData(conversation, getCRMData);

    const item = (
      <SharedConversationItem
        conversation={itemData}
        isSelected={isSelected}
        onSelect={handleSelect}
        selectionMode={selectionMode}
        isMultiSelected={isMultiSelected}
        onToggleSelection={onToggleSelection}
        isPinned={isPinned}
      />
    );

    // Menu de contexto real (PR PR 773): Arquivar/Desarquivar na lista ativa.
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
        {selectionMode ? (
          item
        ) : (
          <ConversationContextMenu
            conversationId={contactId}
            contactName={itemData.contact?.name ?? 'Contato'}
            isArchived={itemData.isArchived}
            onArchive={(id) => onToggleArchive?.(id, Boolean(itemData.isArchived))}
            onMarkAsRead={onMarkAsRead}
            onPin={onPin ? () => onPin(contactId) : undefined}
            onUnpin={onPin ? () => onPin(contactId) : undefined}
          >
            {item}
          </ConversationContextMenu>
        )}
      </div>
    );
  }
);

/** Virtualized Realtime List component. */
export function VirtualizedRealtimeList({
  conversations,
  selectedContactId,
  onSelectConversation,
  selectionMode = false,
  selectedIds = EMPTY_SET,
  onToggleSelection,
  onMarkAsRead,
  onArchive: _onArchive,
  onToggleArchive,
  onPin: _onPin,
  pinnedIds = EMPTY_SET,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  onVisiblePhonesChange,
  getCRMData,
}: VirtualizedRealtimeListProps) {
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [sentinelVisible, setSentinelVisible] = useState(false);

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

    // Only dedup + pin sort. Main sort comes from the inboxFilterPipeline upstream.
    return deduped.sort((a, b) => {
      const aPin = pinnedIds.has(a.contact.id);
      const bPin = pinnedIds.has(b.contact.id);
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      return 0; // preserve pipeline order for non-pinned items
    });
  }, [safeConversations, pinnedIds]);

  const virtualizer = useVirtualizer({
    count: sortedConversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isCompact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT_NORMAL),
    overscan: 5,
  });

  // Lazy-load contact360: apenas os contatos realmente dentro do viewport
  // (scrollTop..scrollTop+clientHeight) entram no batch — itens de overscan
  // ficam de fora até entrarem na tela. O virtualizer re-renderiza a cada
  // scroll, então ler os virtual items aqui sempre reflete a posição atual.
  const scrollEl = parentRef.current;
  const viewTop = scrollEl?.scrollTop ?? 0;
  const viewBottom = viewTop + (scrollEl?.clientHeight ?? 0);
  const visiblePhones = useMemo(() => {
    const phones = new Set<string>();
    for (const v of virtualizer.getVirtualItems()) {
      if (v.end > viewTop && v.start < viewBottom) {
        const conv = sortedConversations[v.index];
        if (conv?.contact?.phone) phones.add(conv.contact.phone);
      }
    }
    return [...phones].sort();
  }, [virtualizer, sortedConversations, viewTop, viewBottom]);

  // Reporta ao pai somente quando o CONJUNTO de phones visíveis muda
  // (evita loop de render: pai seta estado → re-render → mesmo key → no-op).
  const visiblePhonesKey = visiblePhones.join('|');
  const lastVisiblePhonesRef = useRef<{ key: string; phones: string[] } | null>(null);
  useEffect(() => {
    const prev = lastVisiblePhonesRef.current;
    if (prev && prev.key === visiblePhonesKey) return;
    lastVisiblePhonesRef.current = { key: visiblePhonesKey, phones: visiblePhones };
    onVisiblePhonesChange?.(visiblePhones);
  }, [visiblePhonesKey, visiblePhones, onVisiblePhonesChange]);

  // F4-01: scroll infinito — IntersectionObserver no sentinel do fim da lista.
  // Quando o sentinel entra na viewport (com folga de 400px) e ainda há
  // páginas, dispara onLoadMore. O estado sentinelVisible + o guard de
  // loadingMore evitam disparos repetidos enquanto o fetch está em curso.
  useEffect(() => {
    const el = sentinelRef.current;
    const root = parentRef.current;
    if (!el || !root || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setSentinelVisible(entries.some((e) => e.isIntersecting));
      },
      { root, rootMargin: '400px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore]);

  useEffect(() => {
    if (sentinelVisible && hasMore && !loadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [sentinelVisible, hasMore, loadingMore, onLoadMore]);

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
              onMarkAsRead={onMarkAsRead}
              onToggleArchive={onToggleArchive}
              onPin={_onPin}
              getCRMData={getCRMData}
            />
          );
        })}
      </div>
      {/* F4-01: sentinel do scroll infinito — observado pelo IntersectionObserver acima. */}
      <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Carregando mais conversas…
        </div>
      )}
    </div>
  );
}
