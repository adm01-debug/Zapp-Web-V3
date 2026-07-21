import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MiniChatPiP } from '@/components/mobile/MiniChatPiP';
import { NewMessageIndicator } from './NewMessageIndicator';
import { MessageBatcherIndicator } from './MessageBatcherIndicator';
import { InboxEmptyChat } from './InboxEmptyChat';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { ConversationListSidebar } from './ConversationListSidebar';
import { useGlobalSearchShortcut } from '@/hooks/useGlobalSearchShortcut';
import { useInboxBulkActions } from '@/features/inbox';
import { useInboxFilters } from '@/features/inbox';
import { useRealtimeInbox } from '@/features/inbox';
import { useRealtimeContacts } from '@/features/inbox';
import { useRealtimeFallbackRefetch } from '@/features/inbox';
import { useSLAAlerts } from '@/features/sla';
import { useDepartmentAgents } from '@/features/auth';
import { useEvolutionAutoReconnect } from '@/hooks/useEvolutionAutoReconnect';
import { useAriaAnnouncer } from '@/hooks/useAriaAnnouncer';
import { isValidUUID } from '@/utils/uuid';
import { WifiOff, RefreshCw, Loader2, MessageSquarePlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useInboxSidebarResize } from './useInboxSidebarResize';
import { useInboxKeyboardShortcuts } from './useInboxKeyboardShortcuts';

const ChatPanel = lazy(() => import('./ChatPanel').then((m) => ({ default: m.ChatPanel })));
const ContactDetailsResponsive = lazy(() =>
  import('./ContactDetailsResponsive').then((m) => ({ default: m.ContactDetailsResponsive }))
);
const GlobalSearch = lazy(() =>
  import('./GlobalSearch').then((m) => ({ default: m.GlobalSearch }))
);
const NewConversationModal = lazy(() =>
  import('./NewConversationModal').then((m) => ({ default: m.NewConversationModal }))
);

const ChatFallback = () => (
  <div className="flex flex-1 items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

interface SearchResult {
  id: string;
  type: 'message' | 'contact' | 'transcription' | 'action' | 'crm';
  title: string;
  preview: string;
  timestamp: Date;
  contactId?: string;
  contactName?: string;
  messageType?: string;
  tags?: string[];
  action?: () => void;
  crmPhone?: string;
}

/** Realtime Inbox View component. */
export function RealtimeInboxView() {
  const isMobile = useIsMobile();
  const inbox = useRealtimeInbox();
  const { sidebarWidth, windowWidth, startResizing, resetWidth } = useInboxSidebarResize();

  useEvolutionAutoReconnect('wpp2');

  useSLAAlerts({
    contactId: inbox.selectedContactId,
    contactName: inbox.legacyConversation?.contact.name || 'Contato',
    scope: 'current',
    firstResponseStatus: 'na',
    resolutionStatus: 'na',
    ruleName: 'Atraso na Entrega',
    awaitingMs: null,
    resolutionDurationMs: null,
    deliveryDelayStatus: inbox.deliveryAlert?.status,
    deliveryDelayMs: inbox.deliveryAlert?.delay,
    customMessage: inbox.deliveryAlert?.message,
  });
  useRealtimeContacts({ instance: 'wpp2' });
  useRealtimeFallbackRefetch();

  const inboxFilters = useInboxFilters({
    conversations: inbox.cachedConversations,
    profileId: inbox.profile?.id,
    search: inbox.search,
    sortBy: inbox.sortBy,
    statusFilter: inbox.statusFilter,
  });

  const { agentIds: departmentAgentIds } = useDepartmentAgents();
  const setDepartmentAgentIds = inboxFilters.setDepartmentAgentIds;
  useEffect(() => {
    setDepartmentAgentIds(departmentAgentIds);
  }, [departmentAgentIds, setDepartmentAgentIds]);

  const bulkActions = useInboxBulkActions({
    refetch: inbox.refetch,
    filteredConversations: inboxFilters.filteredConversations,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await inbox.refetch();
    },
    disabled: !isMobile || !!inbox.selectedContactId,
  });

  const { announce } = useAriaAnnouncer();
  const lastUnreadRef = useRef(0);
  useEffect(() => {
    const total = (inboxFilters.filteredConversations || []).reduce(
      (sum: number, c) => sum + Number(c?.['unreadCount'] ?? 0), // ignore-audit
      0
    );
    if (total > lastUnreadRef.current && lastUnreadRef.current > 0) {
      const delta = total - lastUnreadRef.current;
      announce(delta === 1 ? 'Nova mensagem recebida' : `${delta} novas mensagens recebidas`);
    }
    lastUnreadRef.current = total;
  }, [inboxFilters.filteredConversations, announce]);

  const openGlobalSearch = useCallback(
    () => inbox.setGlobalSearchOpen(true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inbox.setGlobalSearchOpen]
  );
  useGlobalSearchShortcut({ onOpen: openGlobalSearch });

  useEffect(() => {
    if (!inbox.pendingContactId || inbox.loading) return;
    inboxFilters.setMainTab('search');
    inboxFilters.setSubTab('attending');
    inbox.setSelectedContactId(inbox.pendingContactId);
    inbox.setSelectedContact(inbox.pendingContactId);
    if (!(inbox as any).useExternalDb && isValidUUID(inbox.pendingContactId)) {
      inbox.markAsRead(inbox.pendingContactId);
    }
    inbox.setPendingContactId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.pendingContactId, inbox.loading]);

  const { selectAll, selectionMode, selectedIds, bulkArchive, clearSelection, bulkMarkAsRead } =
    bulkActions;
  useInboxKeyboardShortcuts({
    selectAll,
    selectionMode,
    selectedIds,
    bulkArchive,
    clearSelection,
    bulkMarkAsRead,
  });

  const handleGlobalSearchResult = (result: SearchResult) => {
    if (!result.contactId) return;
    inbox.handleSelectConversation(result.contactId);
    if (result.type === 'message' || result.type === 'transcription') {
      inbox.setPendingMessageId(result.id);
    }
  };

  if (inbox.error) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <WifiOff className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-foreground">Erro de conexão</h3>
          <p className="mb-4 text-sm text-muted-foreground">{inbox.error}</p>
          <Button onClick={inbox.refetch} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-background">
      {inbox.globalSearchOpen && (
        <Suspense fallback={null}>
          <GlobalSearch
            open={inbox.globalSearchOpen}
            onOpenChange={inbox.setGlobalSearchOpen}
            onSelectResult={handleGlobalSearchResult}
          />
        </Suspense>
      )}

      <NewMessageIndicator
        show={!!inbox.newMessageNotification}
        contactId={inbox.newMessageNotification?.contactId}
        contactName={inbox.newMessageNotification?.contactName || ''}
        contactAvatar={inbox.newMessageNotification?.contactAvatar}
        message={inbox.newMessageNotification?.message || ''}
        onView={inbox.handleNotificationView}
        onDismiss={inbox.dismissNotification}
      />

      <MessageBatcherIndicator status={inbox.batcherStatus} />

      {inbox.showNewConversation && (
        <Suspense fallback={null}>
          <NewConversationModal
            open={inbox.showNewConversation}
            onOpenChange={inbox.setShowNewConversation}
            onConversationStarted={(contactId) => {
              inbox.setSelectedContactId(contactId);
              inbox.refetch();
            }}
          />
        </Suspense>
      )}

      {!isMobile && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => inbox.setShowNewConversation(true)}
              className="fixed bottom-24 right-6 z-50 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95"
              aria-label="Nova conversa"
            >
              <MessageSquarePlus className="h-6 w-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Nova Conversa
          </TooltipContent>
        </Tooltip>
      )}

      <div className="group/inbox relative flex h-full min-h-0 w-full flex-row">
        <div
          className={cn(
            'relative flex h-full transition-all duration-300 ease-in-out',
            isMobile && inbox.selectedContactId && 'hidden'
          )}
          style={{
            width: isMobile
              ? sidebarWidth >= windowWidth - 20
                ? '100%'
                : `${sidebarWidth}px`
              : `${sidebarWidth}px`,
          }}
        >
          <ConversationListSidebar
            inbox={inbox}
            inboxFilters={inboxFilters}
            bulkActions={bulkActions}
            pullToRefresh={pullToRefresh}
            width={sidebarWidth}
          />
        </div>

        {/* Reset Width Button - Visible when not at default */}
        <button
          type="button"
          onClick={resetWidth}
          className={cn(
            'absolute top-1/2 z-[60] flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-xl border border-border bg-background shadow-lg transition-all duration-200 hover:bg-muted active:scale-95',
            isMobile && inbox.selectedContactId && 'hidden',
            (sidebarWidth === 391 || (isMobile && sidebarWidth === windowWidth)) &&
              'pointer-events-none opacity-0'
          )}
          style={{ left: `${sidebarWidth}px` }}
          title="Resetar largura padrão (391px)"
          aria-label="Resetar largura padrão"
        >
          <div className="flex gap-0.5">
            <div className="h-4 w-1 rounded-full bg-primary/40" />
            <div className="h-4 w-1 rounded-full bg-primary/20" />
          </div>
        </button>

        <div
          onMouseDown={startResizing}
          onTouchStart={startResizing}
          className={cn(
            'group/handle absolute z-50 flex h-full w-4 cursor-col-resize items-center justify-center transition-all hover:bg-primary/10 active:bg-primary/20',
            isMobile && inbox.selectedContactId && 'hidden',
            sidebarWidth <= 280 &&
              'bg-destructive/5 after:absolute after:inset-y-0 after:left-0 after:w-1 after:animate-pulse after:bg-destructive',
            sidebarWidth >= Math.min(600, windowWidth - (isMobile ? 0 : 60)) &&
              'bg-destructive/5 after:absolute after:inset-y-0 after:right-0 after:w-1 after:animate-pulse after:bg-destructive'
          )}
          style={{ left: `${sidebarWidth}px` }}
        >
          <div className="h-full w-[1px] bg-border transition-colors group-hover/handle:bg-primary/50" />
        </div>
      </div>

      <div
        className={cn(
          'relative z-10 flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-card/20 transition-all duration-300 ease-in-out',
          isMobile && !inbox.selectedContactId && 'hidden',
          isMobile &&
            inbox.selectedContactId &&
            'fixed inset-0 z-[100] duration-300 animate-in slide-in-from-right'
        )}
      >
        {inbox.legacyConversation ? (
          <Suspense fallback={<ChatFallback />}>
            <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
              <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
                {inbox.selectedContactId && (
                  <SectionErrorBoundary sectionName="Chat" className="h-full">
                    <ChatPanel
                      key={inbox.legacyConversation.id}
                      conversation={inbox.legacyConversation}
                      messages={inbox.legacyMessages}
                      onSendMessage={inbox.handleSendMessage}
                      onSendAudio={inbox.handleSendAudio}
                      onLoadOlder={inbox.loadOlderMessages}
                      onCancelLoadOlder={inbox.cancelLoadOlderMessages}
                      loadingOlder={inbox.loadingOlderMessages}
                      hasMoreOlder={inbox.hasMoreMessages}
                      whisperCount={inbox.whisperCount}
                      showDetails={isMobile ? false : inbox.showDetails}
                      onToggleDetails={() => inbox.setShowDetails(!inbox.showDetails)}
                      initialHighlightMessageId={inbox.pendingMessageId}
                      isLoading={inbox.selectedMessagesLoading}
                      messageQueue={inbox.messageQueue}
                      onHighlightConsumed={() => {
                        inbox.setPendingMessageId(null);
                        try {
                          const url = new URL(window.location.href);
                          if (url.searchParams.has('message')) {
                            url.searchParams.delete('message');
                            window.history.replaceState(null, '', url.toString());
                          }
                        } catch {
                          /* noop */
                        }
                      }}
                      onBack={() => {
                        if (inbox.legacyConversation) {
                          inbox.setPipContact({
                            name: inbox.legacyConversation.contact.name,
                            avatar: inbox.legacyConversation.contact.avatar,
                            lastMessage: inbox.legacyConversation.lastMessage?.content,
                            contactId: inbox.legacyConversation.id,
                          });
                        }
                        inbox.setSelectedContactId(null);
                      }}
                    />
                  </SectionErrorBoundary>
                )}
              </div>
              {inbox.showDetails && !isMobile && (
                <SectionErrorBoundary sectionName="Detalhes do Contato">
                  <ContactDetailsResponsive
                    key={`details-${inbox.legacyConversation.id}`}
                    conversation={inbox.legacyConversation}
                    onClose={() => inbox.setShowDetails(false)}
                  />
                </SectionErrorBoundary>
              )}
            </div>
          </Suspense>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-background/40 p-8 text-center">
            <InboxEmptyChat />
          </div>
        )}
      </div>

      {inbox.usingCache && (
        <div className="absolute left-0 right-0 top-0 z-50 bg-warning/90 py-1.5 text-center text-xs font-medium text-warning-foreground shadow-sm backdrop-blur-md">
          📡 Modo offline — exibindo dados em cache
        </div>
      )}

      {isMobile && inbox.pipContact && !inbox.selectedContactId && (
        <MiniChatPiP
          contactName={inbox.pipContact.name}
          contactAvatar={inbox.pipContact.avatar}
          lastMessage={inbox.pipContact.lastMessage}
          isVisible={true}
          onExpand={() => {
            if (inbox.pipContact) inbox.setSelectedContactId(inbox.pipContact.contactId);
            inbox.setPipContact(null);
          }}
          onDismiss={() => inbox.setPipContact(null)}
        />
      )}
    </div>
  );
}
