import { useCallback, useRef, useMemo, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDensity } from '@/hooks/useDensity';
import { MobilePullToRefreshIndicator } from '@/components/mobile/MobilePullToRefresh';
import { VirtualizedRealtimeList } from './VirtualizedRealtimeList';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { InboxFilters } from './InboxFilters';
import { ContactTypeFilter, FILTER_OPTIONS } from './ContactTypeFilter';
import { FailureCategoryFilter } from './FailureCategoryFilter';
import { TicketTabs } from './TicketTabs';
import type { useInboxFilters } from '../hooks/useInboxFilters';
import type { useInboxBulkActions } from '../hooks/useInboxBulkActions';
import type { useRealtimeInbox } from '../hooks/useRealtimeInbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Tooltips were removed from this header to avoid Radix Slot ref-loop bug
// (TooltipTrigger asChild on inline span/Button caused Maximum update depth).
// Replaced with native title/aria-label which are equivalent for these controls.
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

import { WhatsAppConnectionStatus } from '@/features/connections';
import { useInboxShortcuts } from '../hooks/useInboxShortcuts';
import { toast } from 'sonner';

type InboxState = ReturnType<typeof useRealtimeInbox>;
type InboxFiltersState = ReturnType<typeof useInboxFilters>;
type BulkActionsState = ReturnType<typeof useInboxBulkActions>;

interface PullToRefreshState {
  isRefreshing: boolean;
  pullProgress: number;
  pullDistance: number;
  containerRef: RefObject<HTMLDivElement>;
  handlers: Record<string, unknown>;
}

interface ConversationListSidebarProps {
  inbox: InboxState;
  inboxFilters: InboxFiltersState;
  bulkActions: BulkActionsState;
  pullToRefresh: PullToRefreshState;
  width?: number;
}

/** Conversation List Sidebar component. */
export function ConversationListSidebar({
  inbox,
  inboxFilters,
  bulkActions,
  pullToRefresh,
  width: _width = 340,
}: ConversationListSidebarProps) {
  const isMobile = useIsMobile();
  const { density } = useDensity();
  const contactSearchRef = useRef<HTMLInputElement>(null);

  const sortedFilteredIds = useMemo(
    () => inboxFilters.filteredConversations.map((c) => c.contact.id), // ignore-audit
    [inboxFilters.filteredConversations]
  );

  const handleNextConversation = useCallback(() => {
    const currentId = inbox.selectedContactId;
    if (!currentId) {
      if (sortedFilteredIds.length > 0) inbox.handleSelectConversation(sortedFilteredIds[0]);
      return;
    }
    const idx = sortedFilteredIds.indexOf(currentId);
    if (idx >= 0 && idx < sortedFilteredIds.length - 1) {
      inbox.handleSelectConversation(sortedFilteredIds[idx + 1]);
    }
  }, [inbox, sortedFilteredIds]);

  const handlePrevConversation = useCallback(() => {
    const currentId = inbox.selectedContactId;
    if (!currentId) return;
    const idx = sortedFilteredIds.indexOf(currentId);
    if (idx > 0) {
      inbox.handleSelectConversation(sortedFilteredIds[idx - 1]);
    }
  }, [inbox, sortedFilteredIds]);

  const handleAgentChange = useCallback(
    (agentId: string | null) => inboxFilters.setFilters({ ...inboxFilters.filters, agentId }),
    [inboxFilters]
  );

  const onSearchFocus = useCallback(() => contactSearchRef.current?.focus(), []);
  const onArchive = useCallback(() => {
    if (inbox.selectedContactId) {
      toast.info('Arquivando conversa...');
    }
  }, [inbox.selectedContactId]);
  const onTransfer = useCallback(() => {
    if (inbox.selectedContactId) {
      window.dispatchEvent(
        new CustomEvent('open-transfer-dialog', {
          detail: { contactId: inbox.selectedContactId },
        })
      );
    }
  }, [inbox.selectedContactId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onRefresh = useCallback(() => inbox.refetch(), [inbox.refetch]);

  useInboxShortcuts({
    onSearchFocus,
    onNextConversation: handleNextConversation,
    onPrevConversation: handlePrevConversation,
    onArchive,
    onTransfer,
    onRefresh,
  });

  return (
    <div
      className={cn(
        'relative z-10 flex h-full min-h-0 w-full flex-shrink-0 flex-col overflow-hidden border-r border-border/10 bg-background shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] transition-all duration-500 dark:bg-card',
        isMobile ? (inbox.selectedContactId ? 'hidden' : 'w-full') : ''
      )}
    >
      <BulkActionsToolbar
        selectedCount={bulkActions.selectedIds.size}
        onMarkAsRead={bulkActions.bulkMarkAsRead}
        onTransfer={bulkActions.bulkTransfer}
        onArchive={bulkActions.bulkArchive}
        onClearSelection={bulkActions.clearSelection}
        isLoading={bulkActions.bulkLoading}
      />

      <div
        className={cn(
          'shrink-0 border-b border-border/20 px-4 transition-all',
          isMobile
            ? 'space-y-4 pb-3 pt-2'
            : density === 'compact'
              ? 'space-y-2 bg-muted/20 pb-2 pt-3'
              : 'space-y-4 bg-muted/40 pb-5 pt-8 backdrop-blur-3xl'
        )}
      >
        {!isMobile && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WhatsAppConnectionStatus />
            </div>

            <div className="flex items-center gap-0.5">
              <Select
                value={inbox.sortBy}
                onValueChange={(value) => {
                  if (value === 'lastMessage' || value === 'unread' || value === 'name') {
                    inbox.setSortBy(value);
                  }
                }}
              >
                <SelectTrigger className="h-7 w-auto gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] font-medium hover:bg-muted/60 focus:ring-0">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent align="end" className="w-[140px]">
                  <SelectItem value="lastMessage" className="text-xs font-semibold tracking-tight">
                    Recentes
                  </SelectItem>
                  <SelectItem value="unread" className="text-xs font-semibold tracking-tight">
                    Não lidas
                  </SelectItem>
                  <SelectItem value="name" className="text-xs font-semibold tracking-tight">
                    Nome (A-Z)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <div className={cn('shrink-0', isMobile ? 'w-[130px]' : 'w-[130px]')}>
            <ContactTypeFilter
              value={inboxFilters.selectedContactType}
              onChange={inboxFilters.handleContactTypeChange}
              conversations={inbox.cachedConversations ?? []}
            />
          </div>

          {inboxFilters.showOnlyRetrying && (
            <FailureCategoryFilter
              value={inboxFilters.failureCategoryFilter}
              onChange={inboxFilters.setFailureCategoryFilter}
              counts={inboxFilters.failureCategoryCounts}
            />
          )}
        </div>

        <ErrorBoundary
          fallback={
            <div className="p-2 text-center text-xs text-muted-foreground">
              Erro ao carregar abas
            </div>
          }
        >
          <div
            className={cn(
              'transition-all duration-300',
              density === 'compact' ? 'origin-top scale-[0.96]' : ''
            )}
          >
            <TicketTabs
              conversations={inbox.cachedConversations}
              mainTab={inboxFilters.mainTab}
              subTab={inboxFilters.subTab}
              onMainTabChange={inboxFilters.setMainTab}
              onSubTabChange={inboxFilters.setSubTab}
              showAll={inboxFilters.showAll}
              onShowAllChange={inboxFilters.setShowAll}
              scope={inboxFilters.scope as any}
              onScopeChange={inboxFilters.setScope}
              selectedQueueId={inboxFilters.selectedQueueId}
              onQueueChange={inboxFilters.setSelectedQueueId}
              contactType={inboxFilters.selectedContactType}
              onContactTypeChange={inboxFilters.handleContactTypeChange}
              selectedAgentId={inboxFilters.filters.agentId ?? undefined}
              onAgentChange={handleAgentChange}
              departmentAgentIds={inboxFilters.departmentAgentIds}
            />
          </div>
        </ErrorBoundary>

        <ErrorBoundary
          fallback={
            <div className="p-2 text-center text-xs text-muted-foreground">
              Erro ao carregar filtros
            </div>
          }
        >
          <div
            className={cn(
              'transition-all duration-300',
              density === 'compact' ? '-mt-1 origin-top scale-[0.96]' : ''
            )}
          >
            <InboxFilters
              filters={inboxFilters.filters}
              onFiltersChange={inboxFilters.setFilters}
            />
          </div>
        </ErrorBoundary>
      </div>

      {isMobile && (
        <MobilePullToRefreshIndicator
          isRefreshing={pullToRefresh.isRefreshing}
          pullProgress={pullToRefresh.pullProgress}
          pullDistance={pullToRefresh.pullDistance}
        />
      )}

      <div
        ref={pullToRefresh.containerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        {...(isMobile ? pullToRefresh.handlers : {})}
      >
        {inbox.loading ? (
          <div className="space-y-1 p-3">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-3 rounded-xl p-2.5"
              >
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton
                      className="h-3.5 rounded-md"
                      style={{ width: `${60 + Math.random() * 40}%` }}
                    />
                    <Skeleton className="h-3 w-10 rounded-md" />
                  </div>
                  <Skeleton
                    className="h-3 rounded-md"
                    style={{ width: `${40 + Math.random() * 30}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        ) : inboxFilters.filteredConversations.length === 0 ? (
          (() => {
            const activeOpt = FILTER_OPTIONS.find(
              (o) => o.value === (inboxFilters.selectedContactType || 'all')
            );
            const EmptyIcon = activeOpt?.icon || MessageSquare;
            const emptyMessages: Record<string, string> = {
              individual: 'Nenhum chat individual encontrado',
              grupo: 'Nenhum grupo encontrado',
              grupo_orcamentos: 'Nenhum orçamento em aberto',
              grupo_aprovacao: 'Nenhuma aprovação pendente',
              grupo_os: 'Nenhuma O.S. encontrada',
              grupo_acerto: 'Nenhum acerto pendente',
              grupo_sem_categoria: 'Nenhum grupo sem categoria',
              cliente: 'Nenhum cliente encontrado',
              colaborador: 'Nenhum colaborador encontrado',
              fornecedor: 'Nenhum fornecedor encontrado',
              prestador_servico: 'Nenhum prestador encontrado',
              transportadora: 'Nenhuma transportadora encontrada',
            };
            // Distingue "banco sem dados" (allConversations vazio) de
            // "filtros esconderam tudo" (allConversations > 0 mas filtered = 0).
            const totalLoaded = (inbox.conversations?.length ?? 0);
            const filtersHideAll =
              !inbox.usingCache && !inboxFilters.search && totalLoaded > 0;
            const msg = inbox.usingCache
              ? 'Modo offline — sem dados em cache'
              : inboxFilters.search
                ? 'Nenhuma conversa encontrada'
                : filtersHideAll
                  ? `Nenhuma conversa nesta aba (${totalLoaded} no total). Ajuste os filtros.`
                  : emptyMessages[inboxFilters.selectedContactType || ''] ||
                    'Nenhuma conversa recente encontrada para a instância ativa';
            return (
              <motion.div
                key={inboxFilters.selectedContactType || 'all'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('text-center', density === 'compact' ? 'p-4' : 'p-8')}
              >
                <EmptyIcon
                  className={cn(
                    'mx-auto mb-3 transition-all duration-300',
                    density === 'compact' ? 'h-7 w-7' : 'h-10 w-10',
                    activeOpt?.iconColor || 'text-muted-foreground/30'
                  )}
                />
                <p
                  className={cn(
                    'text-muted-foreground',
                    density === 'compact' ? 'text-[12px]' : 'text-sm'
                  )}
                >
                  {msg}
                </p>
              </motion.div>
            );
          })()
        ) : (
          <ErrorBoundary
            fallback={
              <div className="p-8 text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Erro ao carregar. Recarregue.</p>
              </div>
            }
          >
            <VirtualizedRealtimeList
              conversations={inboxFilters.filteredConversations}
              selectedContactId={inbox.selectedContactId}
              onSelectConversation={inbox.handleSelectConversation}
              selectionMode={bulkActions.selectionMode}
              selectedIds={bulkActions.selectedIds}
              onToggleSelection={bulkActions.toggleSelection}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
