import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from '@/features/auth';
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
import { useSLAAlerts } from '@/features/sla/hooks/useSLAAlerts';
import { useDepartmentAgents } from '@/features/auth';
import { useEvolutionAutoReconnect } from '@/hooks/useEvolutionAutoReconnect';
import { useAriaAnnouncer } from '@/hooks/useAriaAnnouncer';
import { isValidUUID } from '@/utils/uuid';
import { WifiOff, RefreshCw, Loader2, MessageSquarePlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ChatPanel = lazy(() => import('./ChatPanel').then(m => ({ default: m.ChatPanel })));
const ContactDetails = lazy(() => import('./ContactDetails').then(m => ({ default: m.ContactDetails })));
const ContactDetailsResponsive = lazy(() => import('./ContactDetailsResponsive').then(m => ({ default: m.ContactDetailsResponsive })));
const GlobalSearch = lazy(() => import('./GlobalSearch').then(m => ({ default: m.GlobalSearch })));
const NewConversationModal = lazy(() => import('./NewConversationModal').then(m => ({ default: m.NewConversationModal })));

const ChatFallback = () => (
  <div className="flex-1 flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-primary animate-spin" />
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

export function RealtimeInboxView() {
  const isMobile = useIsMobile();
  const inbox = useRealtimeInbox();
  const { profile } = useAuth();
  
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const workspacePart = profile?.department_id ? `:${profile.department_id}` : '';
    const key = profile?.id ? `zapp:sidebarWidth:${profile.id}${workspacePart}` : 'zapp:sidebarWidth';
    const saved = localStorage.getItem(key);
    const initialWidth = saved ? parseInt(saved, 10) : 391;
    // Clamp initial width
    const maxWidth = typeof window !== 'undefined' ? Math.min(600, window.innerWidth - (isMobile ? 0 : 60)) : 600;
    return Math.min(initialWidth, maxWidth);
  });
  
  const isResizing = useRef(false);

  const saveWidth = useCallback((width: number) => {
    const workspacePart = profile?.department_id ? `:${profile.department_id}` : '';
    const key = profile?.id ? `zapp:sidebarWidth:${profile.id}${workspacePart}` : 'zapp:sidebarWidth';
    localStorage.setItem(key, width.toString());
  }, [profile?.id, profile?.department_id]);

  const handleMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {});
  const handleTouchMoveRef = useRef<(e: TouchEvent) => void>(() => {});
  const stopResizingRef = useRef<() => void>(() => {});

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMoveRef.current);
    document.removeEventListener('mouseup', stopResizingRef.current);
    document.removeEventListener('touchmove', handleTouchMoveRef.current);
    document.removeEventListener('touchend', stopResizingRef.current);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const handleResize = useCallback((clientX: number) => {
    const minWidth = 280;
    const maxWidth = Math.min(600, window.innerWidth - (isMobile ? 0 : 60));
    
    let newWidth = clientX;
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    setSidebarWidth(newWidth);
    saveWidth(newWidth);
  }, [saveWidth, isMobile]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    handleResize(e.clientX);
  }, [handleResize]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isResizing.current) return;
    handleResize(e.touches[0].clientX);
  }, [handleResize]);

  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
    handleTouchMoveRef.current = handleTouchMove;
    stopResizingRef.current = stopResizing;
  }, [handleMouseMove, handleTouchMove, stopResizing]);

  // Load width when profile is available
  useEffect(() => {
    if (profile?.id) {
      const workspacePart = profile?.department_id ? `:${profile.department_id}` : '';
      const key = `zapp:sidebarWidth:${profile.id}${workspacePart}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setSidebarWidth(parseInt(saved, 10));
      }
    }
  }, [profile?.id, profile?.department_id]);

  // Handle window resize to clamp sidebar width and keep windowWidth state reactive
  useEffect(() => {
    const onWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setSidebarWidth(prev => {
        const maxWidth = Math.min(600, window.innerWidth - (isMobile ? 0 : 60));
        if (prev > maxWidth) return maxWidth;
        return prev;
      });
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [isMobile]);

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMoveRef.current);
    document.addEventListener('mouseup', stopResizingRef.current);
    document.addEventListener('touchmove', handleTouchMoveRef.current, { passive: false });
    document.addEventListener('touchend', stopResizingRef.current);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const resetWidth = useCallback(() => {
    setSidebarWidth(391);
    saveWidth(391);
  }, [saveWidth]);
  
  // Monitora a conexão com o provedor e reconecta automaticamente se necessário
  useEvolutionAutoReconnect('wpp2');

  // Conecta alertas de delivery ao useSLAAlerts
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
  // Realtime sync of evolution_contacts (FATOR X) → React Query caches
  useRealtimeContacts({ instance: 'wpp2' });
  // Safety net: periodic + on-reconnect refetch in case the realtime
  // channel drops temporarily and caches drift from source of truth.
  useRealtimeFallbackRefetch();
  const inboxFilters = useInboxFilters({ 
    conversations: inbox.cachedConversations, 
    profileId: inbox.profile?.id,
    search: inbox.search,
    sortBy: inbox.sortBy,
    statusFilter: inbox.statusFilter
  });
  // Sync IDs do departamento → permite escopo "Departamento" no Inbox
  // (coordenador/supervisor vê conversas atribuídas aos colegas do mesmo depto).
  const { agentIds: departmentAgentIds } = useDepartmentAgents();
  // FIX: destructure setter to get stable reference and break potential render loop.
  // Previously, [departmentAgentIds, inboxFilters.setDepartmentAgentIds] caused
  // infinite re-renders because inboxFilters is a new object on every render,
  // making inboxFilters.setDepartmentAgentIds a new function ref each time.
  const setDepartmentAgentIds = inboxFilters.setDepartmentAgentIds;
  useEffect(() => {
    setDepartmentAgentIds(departmentAgentIds);
  }, [departmentAgentIds, setDepartmentAgentIds]);

  const bulkActions = useInboxBulkActions({ refetch: inbox.refetch, filteredConversations: inboxFilters.filteredConversations });
  const pullToRefresh = usePullToRefresh({ onRefresh: async () => { await inbox.refetch(); }, disabled: !isMobile || !!inbox.selectedContactId });

  // P0 a11y — anuncia novas mensagens não lidas para leitores de tela (aria-live polite)
  const { announce } = useAriaAnnouncer();
  const lastUnreadRef = useRef(0);
  useEffect(() => {
    const total = (inboxFilters.filteredConversations || []).reduce(
      (sum: number, c: any) => sum + (c?.unreadCount || 0), 0
    );
    if (total > lastUnreadRef.current && lastUnreadRef.current > 0) {
      const delta = total - lastUnreadRef.current;
      announce(delta === 1 ? 'Nova mensagem recebida' : `${delta} novas mensagens recebidas`);
    }
    lastUnreadRef.current = total;
  }, [inboxFilters.filteredConversations, announce]);

  useGlobalSearchShortcut({ onOpen: () => inbox.setGlobalSearchOpen(true) });

  // FIX: removed inbox.conversations from deps — it's not used in the effect body
  // and was causing extra effect runs whenever conversations updated after selection.
  useEffect(() => {
    if (!inbox.pendingContactId || inbox.loading) return;
    inboxFilters.setMainTab('search');
    inboxFilters.setSubTab('attending');
    inbox.setSelectedContactId(inbox.pendingContactId);
    inbox.setSelectedContact(inbox.pendingContactId);

    // ── markAsRead guard (Bug#2 + Bug#2-residual) ───────────────────────────
    // Bug#2: pendingContactId pode ser JID (ex: "5564984450900@s.whatsapp.net")
    //   → isValidUUID() bloqueia para evitar 400 no PostgREST.
    //
    // Bug#2-residual: Em external mode (inbox.useExternalDb=true), markAsRead
    //   vem de localRealtime (state tree DIFERENTE de externalData.conversations).
    //   Logo é um no-op visual. Adicionalmente, o retry loop de openContactInChat
    //   (15 tentativas × 200ms) despacha open-contact-chat 15 vezes, e cada
    //   dispatch causa um setPendingContactId(UUID) → markAsRead(UUID).
    //   Resultado: 15 × 23 partições = 345 partition scans por navegação, sem
    //   nenhum benefício visual. Em external mode, handleSelectConversation já
    //   envia o read receipt via supabase.functions.invoke('evolution-api').
    //
    // DECISÃO: chamar markAsRead APENAS em local mode.
    if (!inbox.useExternalDb && isValidUUID(inbox.pendingContactId)) {
      inbox.markAsRead(inbox.pendingContactId);
    }
    // ────────────────────────────────────────────────────────────────────────

    inbox.setPendingContactId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.pendingContactId, inbox.loading]);

  // FIX: destructure stable action refs to avoid re-running effect when bulkActions
  // object reference changes (new object on every render from useInboxBulkActions).
  const { selectAll, selectionMode, selectedIds, bulkArchive, clearSelection, bulkMarkAsRead } = bulkActions;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.getAttribute('contenteditable') === 'true';
      if (isInput) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionMode && selectedIds.size > 0) { e.preventDefault(); bulkArchive(); }
      if (e.key === 'Escape' && selectionMode) { e.preventDefault(); clearSelection(); }
      if (e.key === 'r' && selectionMode && selectedIds.size > 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); bulkMarkAsRead(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectAll, selectionMode, selectedIds, bulkArchive, clearSelection, bulkMarkAsRead]);

  const handleGlobalSearchResult = (result: SearchResult) => {
    if (!result.contactId) return;
    inbox.handleSelectConversation(result.contactId);
    // Para resultados de mensagem, dispara o destaque "Ver no chat".
    if (result.type === 'message' || result.type === 'transcription') {
      inbox.setPendingMessageId(result.id);
    }
  };

  if (inbox.error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4"><WifiOff className="w-8 h-8 text-destructive" /></div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Erro de conexão</h3>
          <p className="text-muted-foreground text-sm mb-4">{inbox.error}</p>
          <Button onClick={inbox.refetch} variant="outline"><RefreshCw className="w-4 h-4 mr-2" />Tentar novamente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full relative bg-background overflow-hidden">
      {inbox.globalSearchOpen && (
        <Suspense fallback={null}><GlobalSearch open={inbox.globalSearchOpen} onOpenChange={inbox.setGlobalSearchOpen} onSelectResult={handleGlobalSearchResult} /></Suspense>
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
          <NewConversationModal open={inbox.showNewConversation} onOpenChange={inbox.setShowNewConversation} onConversationStarted={(contactId) => { inbox.setSelectedContactId(contactId); inbox.refetch(); }} />
        </Suspense>
      )}

      {!isMobile && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => inbox.setShowNewConversation(true)}
              className="fixed bottom-24 right-6 z-50 w-[54px] h-[54px] rounded-full bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 active:scale-95 transition-all duration-500 flex items-center justify-center border border-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label="Nova conversa"
            >
              <MessageSquarePlus className="w-6 h-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Nova Conversa
          </TooltipContent>
        </Tooltip>
      )}


      <div className="flex flex-row h-full min-h-0 w-full relative group/inbox">
        <div 
          className={cn(
            "relative flex h-full transition-all duration-300 ease-in-out",
            isMobile && inbox.selectedContactId && "hidden"
          )}
          style={{ width: isMobile ? (sidebarWidth >= windowWidth - 20 ? '100%' : `${sidebarWidth}px`) : `${sidebarWidth}px` }}
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
          onClick={resetWidth}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-[60] w-6 h-12 bg-background border border-border shadow-lg rounded-r-xl flex items-center justify-center hover:bg-muted active:scale-95 transition-all duration-200",
            (isMobile && inbox.selectedContactId) && "hidden",
            (sidebarWidth === 391 || (isMobile && sidebarWidth === windowWidth)) && "opacity-0 pointer-events-none"
          )}
          style={{ left: `${sidebarWidth}px` }}
          title="Resetar largura padrão (391px)"
          aria-label="Resetar largura padrão"
        >
          <div className="flex gap-0.5">
            <div className="w-1 h-4 rounded-full bg-primary/40" />
            <div className="w-1 h-4 rounded-full bg-primary/20" />
          </div>
        </button>

        {/* Draggable Handle - Enabled for touch/mobile */}
        <div
          onMouseDown={startResizing}
          onTouchStart={startResizing}
          className={cn(
            "w-4 h-full cursor-col-resize hover:bg-primary/10 active:bg-primary/20 transition-all absolute z-50 group/handle flex items-center justify-center",
            (isMobile && inbox.selectedContactId) && "hidden",
            // Feedback visual ao atingir limites
            sidebarWidth <= 280 && "after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-destructive after:animate-pulse bg-destructive/5",
            sidebarWidth >= Math.min(600, windowWidth - (isMobile ? 0 : 60)) && "after:absolute after:inset-y-0 after:right-0 after:w-1 after:bg-destructive after:animate-pulse bg-destructive/5"
          )}
          style={{ left: `${sidebarWidth}px` }}
        >
          <div className="w-[1px] h-full bg-border group-hover/handle:bg-primary/50 transition-colors" />
        </div>
      </div>

      <div 
        className={cn(
          'flex-1 flex min-w-0 min-h-0 relative z-10 bg-card/20 h-full overflow-hidden transition-all duration-300 ease-in-out', 
          isMobile && !inbox.selectedContactId && 'hidden',
          isMobile && inbox.selectedContactId && 'fixed inset-0 z-[100] animate-in slide-in-from-right duration-300'
        )}
      >
        {inbox.legacyConversation ? (
          <Suspense fallback={<ChatFallback />}>
            <div className="flex-1 flex min-w-0 min-h-0 relative h-full overflow-hidden">
              <div className="flex-1 min-w-0 min-h-0 relative h-full overflow-hidden">
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
                        } catch { /* noop */ }
                      }}
                      onBack={() => {
                        if (inbox.legacyConversation) {
                          inbox.setPipContact({ 
                            name: inbox.legacyConversation.contact.name, 
                            avatar: inbox.legacyConversation.contact.avatar, 
                            lastMessage: inbox.legacyConversation.lastMessage?.content, 
                            contactId: inbox.legacyConversation.id 
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
                  <ContactDetailsResponsive key={`details-${inbox.legacyConversation.id}`} conversation={inbox.legacyConversation} onClose={() => inbox.setShowDetails(false)} />
                </SectionErrorBoundary>
              )}
            </div>
          </Suspense>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background/40">
            <InboxEmptyChat />
          </div>
        )}
      </div>

      {inbox.usingCache && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground text-xs text-center py-1.5 font-medium shadow-sm backdrop-blur-md">📡 Modo offline — exibindo dados em cache</div>
      )}

      {isMobile && inbox.pipContact && !inbox.selectedContactId && (
        <MiniChatPiP contactName={inbox.pipContact.name} contactAvatar={inbox.pipContact.avatar} lastMessage={inbox.pipContact.lastMessage} isVisible={true}
          onExpand={() => { inbox.setSelectedContactId(inbox.pipContact!.contactId); inbox.setPipContact(null); }} onDismiss={() => inbox.setPipContact(null)} />
      )}
    </div>
  );
}
