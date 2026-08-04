/**
 * archivedUi.simulacao.test.tsx — Validação da UI de arquivados (PR PR 773).
 *
 * Cobertura (testes de SIMULAÇÃO, sem backend):
 *  1. ConversationItem (conversation-list/ConversationItem.tsx): badge "Arquivado"
 *     (ícone Archive com aria-label) renderizado quando conversation.isArchived=true,
 *     ausente quando false/undefined — nos dois modos (compact e comfortable).
 *  2. ConversationContextMenu: label dinâmico "Arquivar"/"Desarquivar", ícone
 *     Archive/ArchiveRestore e onClick → onArchive(conversationId) real.
 *  3. ConversationListSidebar: tabs "Conversas | Arquivadas" — transição
 *     all→archived chama setArchivedTab(true) e vice-versa; inicialização a
 *     partir de inboxFilters.archivedTab; sync reverso (reset externo) e empty
 *     state "Nenhuma conversa arquivada".
 *  4. VirtualizedRealtimeList: toConversationItemData propaga isArchived para o
 *     ConversationItem (validação ponta-a-ponta com virtualizer mockado).
 *  5. applyInboxFilters: gate archivedTab (transição de dados all→archived) —
 *     aba Arquivados mostra SÓ arquivadas ignorando mainTab/subTab; fora dela,
 *     arquivadas são excluídas; contadores de aba permanecem normais.
 *
 * Estratégia: mocks leves de UI (motion, tooltip, context-menu, tabs, hooks de
 * viewport) seguindo o padrão de ChatHeaderMenu.callbacks.test.tsx. Os
 * componentes sob teste (ConversationItem, ConversationContextMenu,
 * ConversationListSidebar, VirtualizedRealtimeList) são os REAIS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── Mocks globais de UI (aplicam-se ao arquivo inteiro) ──────────────────────

// motion.div vira div nativa (mesmo padrão do ChatHeaderMenu.callbacks.test)
vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
}));

// A sidebar usa framer-motion diretamente
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
}));

// Ícones: Archive/ArchiveRestore identificáveis por data-testid; o restante usa
// o lucide-react REAL via importOriginal (padrão recomendado pelo vitest 4).
// Evita o erro "[vitest] No X export is defined on the lucide-react mock" quando
// algum módulo real escapa dos mocks — e NUNCA retornar Proxy de módulo mockado
// (vitest 4 quebra com "Cannot create proxy with a non-object").
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  const ArchiveIcon = (props: Record<string, unknown>) => (
    <span data-testid="icon-archive" {...props} />
  );
  const ArchiveRestoreIcon = (props: Record<string, unknown>) => (
    <span data-testid="icon-archive-restore" {...props} />
  );
  return { ...actual, Archive: ArchiveIcon, ArchiveRestore: ArchiveRestoreIcon };
});

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/quick-peek', () => ({
  QuickPeek: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>
      {children}
    </div>
  ),
  AvatarImage: () => <img alt="" data-testid="avatar-image" />,
  AvatarFallback: ({ children }: { children?: ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

vi.mock('@/hooks/useDensity', () => ({
  useDensity: () => ({ density: 'default' }),
}));

vi.mock('@/hooks/useInViewport', () => ({
  useInViewport: () => true,
}));

vi.mock('@/hooks/useContactTyping', () => ({
  useContactTyping: () => false,
}));

// Filhos pesados do ConversationItem que não interessam a esta validação
vi.mock('../SLAIndicatorForContact', () => ({
  SLAIndicatorForContact: () => null,
}));
vi.mock('./conversation-list/RetryFailureBadge', () => ({
  RetryFailureBadge: () => null,
}));
vi.mock('../TypingIndicator', () => ({
  TypingIndicatorCompact: () => null,
}));
vi.mock('../SentimentIndicator', () => ({
  SentimentEmoji: () => null,
  getSentimentFromScore: () => null,
}));

// ContextMenu: itens renderizados direto no DOM (sem portal Radix), como o
// ChatHeaderMenu.callbacks.test faz com o DropdownMenu.
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button role="menuitem" onClick={onClick} className={className ?? ''}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuSubContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuSubTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// Virtualizer fake: 1 item virtual cobrindo a tela inteira.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [{ key: 0, index: 0, start: 0, size: 96, end: 96 }],
    getTotalSize: () => 96,
  }),
}));

// Tabs: espelha o contrato Radix (TabsTrigger dispara onValueChange do Tabs)
// via contexto, permitindo testar a lógica real da sidebar.
vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react');
  const TabsContext = React.createContext<{
    value?: string;
    onValueChange?: (v: string) => void;
  }>({});
  const Tabs = ({
    value,
    onValueChange,
    children,
    className,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
    className?: string;
  }) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div data-testid="tabs" data-value={value} className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
  const TabsList = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="tabs-list" className={className}>
      {children}
    </div>
  );
  const TabsTrigger = ({
    value,
    children,
    className,
  }: {
    value: string;
    children?: ReactNode;
    className?: string;
  }) => {
    const ctx = React.useContext(TabsContext);
    const active = ctx.value === value;
    return (
      <button
        type="button"
        data-testid="tabs-trigger"
        data-value={value}
        data-state={active ? 'active' : 'inactive'}
        aria-selected={active}
        className={className ?? ''}
        onClick={() => ctx.onValueChange?.(value)}
      >
        {children}
      </button>
    );
  };
  return { Tabs, TabsList, TabsTrigger };
});

// Hooks e filhos da ConversationListSidebar (a sidebar real é o alvo; os filhos
// pesados são stubs para isolar a lógica de tabs ↔ setArchivedTab).
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));
vi.mock('@/hooks/useDebounce', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('@/hooks/useExternalContact360Batch', () => ({
  useExternalContact360Batch: () => ({ lookup: undefined }),
}));
vi.mock('@/features/connections', () => ({
  WhatsAppConnectionStatus: () => null,
}));
vi.mock('../../hooks/useInboxShortcuts', () => ({
  useInboxShortcuts: () => {},
}));
vi.mock('../../hooks/useArchiveConversationActions', () => ({
  useArchiveConversationActions: () => ({ archive: vi.fn() }),
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    'aria-label': ariaLabel,
    onClick,
    className,
  }: {
    children?: ReactNode;
    'aria-label'?: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} className={className ?? ''}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('../BulkActionsToolbar', () => ({
  BulkActionsToolbar: () => null,
}));
vi.mock('../InboxFilters', () => ({
  InboxFilters: () => null,
}));
vi.mock('../ContactTypeFilter', () => ({
  ContactTypeFilter: () => null,
  FILTER_OPTIONS: [],
}));
vi.mock('../InboxFilterPresets', () => ({
  InboxFilterPresets: () => null,
}));
vi.mock('../FailureCategoryFilter', () => ({
  FailureCategoryFilter: () => null,
}));
vi.mock('../TicketTabs', () => ({
  TicketTabs: () => null,
}));
// NOTE: VirtualizedRealtimeList NÃO é mockado aqui de propósito: a sidebar o
// renderiza com filteredConversations=[] (→ retorna null) e o bloco 4 testa o
// componente REAL. Mockar o módulo quebraria o teste ponta-a-ponta.

// Pipeline: filterByContactType real simulado (mesmo do inboxFilterPipeline.test)
vi.mock('@/features/inbox', () => ({
  filterByContactType: (
    conversations: { contact: { contact_type?: string | null } }[],
    type: string | null
  ) => {
    if (!type) return conversations;
    return conversations.filter((c) => c.contact.contact_type === type);
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { ConversationItem } from '../conversation-list/ConversationItem';
import { ConversationContextMenu } from '../ConversationContextMenu';
import { ConversationListSidebar } from '../ConversationListSidebar';
import { VirtualizedRealtimeList } from '../VirtualizedRealtimeList';
import { applyInboxFilters, computeInboxTabCounts } from '../../hooks/inboxFilterPipeline';
import type { ConversationWithMessages } from '../../hooks/realtime/types';

type AnyRecord = Record<string, unknown>;

function buildConversationLike(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'c1',
    contact: {
      id: 'c1',
      name: 'Contato Teste',
      phone: '5511999999999',
      tags: [],
      updated_at: '2026-07-24T12:00:00.000Z',
      created_at: '2026-07-24T12:00:00.000Z',
      assigned_to: null,
      contact_type: 'cliente',
    },
    unreadCount: 0,
    lastMessage: null,
    isArchived: false,
    ...overrides,
  };
}

function buildConversation(
  id: string,
  isArchived: boolean,
  name = `Contato ${id}`
): ConversationWithMessages {
  const createdAt = '2026-07-24T12:00:00.000Z';
  return {
    contact: {
      id,
      name,
      surname: null,
      nickname: null,
      phone: `550000000${id}`,
      email: null,
      avatar_url: null,
      tags: null,
      company: null,
      job_title: null,
      assigned_to: null,
      queue_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      whatsapp_connection_id: 'wpp_pink_test',
      contact_type: 'cliente',
      group_category: null,
      ai_sentiment: null,
      channel_type: 'whatsapp',
      channel_connection_id: null,
    },
    messages: [],
    unreadCount: 0,
    lastMessage: null,
    isArchived,
  } as unknown as ConversationWithMessages;
}

function buildPipelineOptions(conversations: ConversationWithMessages[], archivedTab = false) {
  return {
    conversations,
    profileId: 'agent-1',
    externalSearch: undefined,
    search: '',
    sortBy: 'lastMessage' as const,
    statusFilter: 'all' as const,
    mainTab: 'open' as const,
    subTab: 'waiting' as const,
    showAll: false,
    scope: 'mine',
    departmentAgentIds: [],
    selectedQueueId: null,
    selectedContactType: null,
    showOnlyRetrying: false,
    failureCategoryFilter: 'all' as const,
    failureCategoryById: {},
    filters: { status: [], tags: [], agentId: null, dateRange: { from: null, to: null } },
    contactTagsMap: {},
    ticketStates: {},
    customScopes: [],
    hasPermission: () => true,
    permissionsLoading: false,
    enforceChannelPermissions: false,
    archivedTab,
  };
}

function buildInboxFiltersMock(archivedTab: boolean) {
  return {
    archivedTab,
    setArchivedTab: vi.fn(),
    filteredConversations: [] as ConversationWithMessages[],
    filters: { status: [], tags: [], agentId: null, dateRange: { from: null, to: null } },
    selectedContactType: null,
    handleContactTypeChange: vi.fn(),
    presets: [],
    applyInboxPreset: vi.fn(),
    saveInboxPreset: vi.fn(),
    deleteInboxPreset: vi.fn(),
    updateInboxPreset: vi.fn(),
    updateInboxPresetWithCurrent: vi.fn(),
    showOnlyRetrying: false,
    failureCategoryFilter: 'all',
    failureCategoryCounts: {},
    hasActiveInboxFilters: false,
    resetInboxFilters: vi.fn(),
    inboxTabCounts: { open: 0, attending: 0, waiting: 0, resolved: 0, unread: 0 },
    mainTab: 'open',
    subTab: 'waiting',
    setMainTab: vi.fn(),
    setSubTab: vi.fn(),
    showAll: false,
    setShowAll: vi.fn(),
    scope: 'mine',
    setScope: vi.fn(),
    selectedQueueId: null,
    setSelectedQueueId: vi.fn(),
    departmentAgentIds: [],
  };
}

function buildInboxMock() {
  return {
    selectedContactId: null,
    handleSelectConversation: vi.fn(),
    loading: false,
    conversations: [],
    cachedConversations: [],
    refetch: vi.fn(),
    usingCache: false,
    sortBy: 'lastMessage',
    setSortBy: vi.fn(),
    loadMoreConversations: vi.fn(),
    hasMoreConversations: false,
    loadingMoreConversations: false,
  };
}

function renderSidebar(overrides: { archivedTab?: boolean } = {}) {
  const inboxFilters = buildInboxFiltersMock(overrides.archivedTab ?? false);
  const inbox = buildInboxMock();
  const bulkActions = {
    selectedIds: new Set<string>(),
    selectionMode: false,
    bulkMarkAsRead: vi.fn(),
    bulkArchive: vi.fn(),
    clearSelection: vi.fn(),
    bulkLoading: false,
    toggleSelection: vi.fn(),
  };
  const pullToRefresh = {
    isRefreshing: false,
    pullProgress: 0,
    pullDistance: 0,
    containerRef: { current: null },
    handlers: {},
  };
  const view = render(
    <ConversationListSidebar
      inbox={inbox as never}
      inboxFilters={inboxFilters as never}
      bulkActions={bulkActions as never}
      pullToRefresh={pullToRefresh as never}
    />
  );
  return { inboxFilters, inbox, view };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. Badge "Arquivado" no ConversationItem ──────────────────────────────────

describe('ConversationItem — badge Arquivado', () => {
  it('renderiza o indicador "Arquivado" quando isArchived=true (modo compact)', () => {
    render(
      <ConversationItem
        conversation={buildConversationLike({ isArchived: true }) as never}
        isSelected={false}
        onSelect={vi.fn()}
        compact
      />
    );
    expect(screen.getByLabelText('Arquivado')).toBeInTheDocument();
    expect(screen.getByTestId('icon-archive')).toBeInTheDocument();
  });

  it('renderiza o indicador "Arquivado" quando isArchived=true (modo comfortable)', () => {
    render(
      <ConversationItem
        conversation={buildConversationLike({ isArchived: true }) as never}
        isSelected={false}
        onSelect={vi.fn()}
        compact={false}
      />
    );
    expect(screen.getByLabelText('Arquivado')).toBeInTheDocument();
  });

  it('NÃO renderiza o indicador quando isArchived=false', () => {
    render(
      <ConversationItem
        conversation={buildConversationLike({ isArchived: false }) as never}
        isSelected={false}
        onSelect={vi.fn()}
        compact
      />
    );
    expect(screen.queryByLabelText('Arquivado')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-archive')).not.toBeInTheDocument();
  });

  it('NÃO renderiza o indicador quando isArchived é undefined (default)', () => {
    render(
      <ConversationItem
        conversation={buildConversationLike({}) as never}
        isSelected={false}
        onSelect={vi.fn()}
        compact
      />
    );
    expect(screen.queryByLabelText('Arquivado')).not.toBeInTheDocument();
  });
});

// ── 2. ConversationContextMenu: label/ícone/onClick dinâmicos ────────────────

describe('ConversationContextMenu — Arquivar/Desarquivar', () => {
  function renderMenu(isArchived: boolean, onArchive = vi.fn()) {
    render(
      <ConversationContextMenu
        conversationId="conv-42"
        contactName="João"
        isArchived={isArchived}
        onArchive={onArchive}
      >
        <div>trigger</div>
      </ConversationContextMenu>
    );
    return { onArchive };
  }

  it('mostra "Arquivar" + ícone Archive quando !isArchived e chama onArchive(id) no clique', () => {
    const { onArchive } = renderMenu(false);

    expect(screen.getByText('Arquivar')).toBeInTheDocument();
    expect(screen.queryByText('Desarquivar')).not.toBeInTheDocument();
    expect(screen.getByTestId('icon-archive')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-archive-restore')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Arquivar'));
    expect(onArchive).toHaveBeenCalledWith('conv-42');
  });

  it('mostra "Desarquivar" + ícone ArchiveRestore quando isArchived e chama onArchive(id) no clique', () => {
    const { onArchive } = renderMenu(true);

    expect(screen.getByText('Desarquivar')).toBeInTheDocument();
    expect(screen.queryByText('Arquivar')).not.toBeInTheDocument();
    expect(screen.getByTestId('icon-archive-restore')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-archive')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Desarquivar'));
    expect(onArchive).toHaveBeenCalledWith('conv-42');
  });

  it('não quebra sem onArchive (opcional)', () => {
    render(
      <ConversationContextMenu conversationId="conv-42" contactName="João" isArchived={false}>
        <div>trigger</div>
      </ConversationContextMenu>
    );
    fireEvent.click(screen.getByText('Arquivar'));
    expect(screen.getByText('Arquivar')).toBeInTheDocument();
  });
});

// ── 3. ConversationListSidebar: tabs Conversas | Arquivadas ──────────────────

describe('ConversationListSidebar — tabs Conversas | Arquivadas', () => {
  it('renderiza as duas abas', () => {
    renderSidebar();
    expect(screen.getByText('Conversas')).toBeInTheDocument();
    expect(screen.getByText('Arquivadas')).toBeInTheDocument();
  });

  it('transição all→archived chama setArchivedTab(true)', async () => {
    const { inboxFilters } = renderSidebar();

    fireEvent.click(screen.getByText('Arquivadas'));

    await waitFor(() => {
      expect(inboxFilters.setArchivedTab).toHaveBeenLastCalledWith(true);
    });
  });

  it('transição archived→all chama setArchivedTab(false)', async () => {
    const { inboxFilters } = renderSidebar({ archivedTab: true });

    fireEvent.click(screen.getByText('Conversas'));

    await waitFor(() => {
      expect(inboxFilters.setArchivedTab).toHaveBeenLastCalledWith(false);
    });
  });

  it('inicializa a aba ativa a partir de inboxFilters.archivedTab (respeita ?tab=archived)', () => {
    renderSidebar({ archivedTab: true });

    // O mock renderiza os triggers na ordem do TabsList: all, archived
    const triggers = screen.getAllByTestId('tabs-trigger');
    expect(triggers[0]).toHaveAttribute('data-value', 'all');
    expect(triggers[1]).toHaveAttribute('data-value', 'archived');
    expect(triggers[1]).toHaveAttribute('data-state', 'active');
    expect(triggers[0]).toHaveAttribute('data-state', 'inactive');
  });

  it('sync reverso: reset externo (archivedTab=true→false) volta a aba para Conversas', async () => {
    const { inboxFilters, view } = renderSidebar({ archivedTab: true });

    // Reset externo simulado: "Limpar filtros" chama setArchivedTab(false) no hook pai
    inboxFilters.archivedTab = false;
    view.rerender(
      <ConversationListSidebar
        inbox={buildInboxMock() as never}
        inboxFilters={inboxFilters as never}
        bulkActions={
          {
            selectedIds: new Set<string>(),
            selectionMode: false,
            bulkMarkAsRead: vi.fn(),
            bulkArchive: vi.fn(),
            clearSelection: vi.fn(),
            bulkLoading: false,
            toggleSelection: vi.fn(),
          } as never
        }
        pullToRefresh={
          {
            isRefreshing: false,
            pullProgress: 0,
            pullDistance: 0,
            containerRef: { current: null },
            handlers: {},
          } as never
        }
      />
    );

    await waitFor(() => {
      const triggers = screen.getAllByTestId('tabs-trigger');
      expect(triggers[0]).toHaveAttribute('data-state', 'active');
      expect(triggers[1]).toHaveAttribute('data-state', 'inactive');
    });
  });

  it('mostra empty state "Nenhuma conversa arquivada" na aba Arquivados', () => {
    renderSidebar({ archivedTab: true });
    expect(screen.getByText('Nenhuma conversa arquivada')).toBeInTheDocument();
  });
});

// ── 4. VirtualizedRealtimeList: propagação de isArchived ─────────────────────

describe('VirtualizedRealtimeList — toConversationItemData propaga isArchived', () => {
  it('renderiza badge apenas na conversa com isArchived=true (ponta-a-ponta)', () => {
    const archived = buildConversation('c-arch', true, 'Arquivada Silva');
    const normal = buildConversation('c-norm', false, 'Normal Souza');

    render(
      <VirtualizedRealtimeList
        conversations={[archived, normal]}
        selectedContactId={null}
        onSelectConversation={vi.fn()}
      />
    );

    // O mock do virtualizer expõe 1 slot; sortedConversations mantém a ordem do array.
    const items = screen.getAllByTestId('conversation-item');
    expect(items.length).toBeGreaterThan(0);

    // Em qualquer item renderizado, o badge deve aparecer somente para a arquivada.
    // (com 1 slot virtual + 2 conversas, o índice 0 é a arquivada)
    const archivedItem = items[0];
    expect(within(archivedItem).getByLabelText('Arquivado')).toBeInTheDocument();

    // A conversa normal não carrega o badge.
    if (items.length > 1) {
      expect(within(items[1]).queryByLabelText('Arquivado')).not.toBeInTheDocument();
    }
  });

  it('nenhuma badge quando nenhuma conversa é arquivada', () => {
    const normal = buildConversation('c-norm', false, 'Normal Souza');

    render(
      <VirtualizedRealtimeList
        conversations={[normal]}
        selectedContactId={null}
        onSelectConversation={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Arquivado')).not.toBeInTheDocument();
  });
});

// ── 5. Pipeline: gate archivedTab (transição de dados all↔archived) ──────────

describe('applyInboxFilters — gate archivedTab', () => {
  const convs = [
    buildConversation('a1', true, 'Arquivada Um'),
    buildConversation('a2', false, 'Ativa Dois'),
    buildConversation('a3', true, 'Arquivada Tres'),
  ];

  it('archivedTab=true retorna SOMENTE arquivadas, ignorando mainTab/subTab', () => {
    const result = applyInboxFilters(
      buildPipelineOptions(convs, true) as never
    );
    expect(result.map((c) => c.contact.id).sort()).toEqual(['a1', 'a3']);
  });

  it('archivedTab=true ignora mainTab=resolved (não filtra por status)', () => {
    const result = applyInboxFilters({
      ...buildPipelineOptions(convs, true),
      mainTab: 'resolved',
    } as never);
    expect(result.map((c) => c.contact.id).sort()).toEqual(['a1', 'a3']);
  });

  it('archivedTab=false exclui arquivadas de todos os filtros', () => {
    const result = applyInboxFilters(buildPipelineOptions(convs, false) as never);
    expect(result.map((c) => c.contact.id)).toEqual(['a2']);
  });

  it('busca continua funcionando dentro da aba Arquivados', () => {
    const result = applyInboxFilters({
      ...buildPipelineOptions(convs, true),
      search: 'tres',
    } as never);
    expect(result.map((c) => c.contact.id)).toEqual(['a3']);
  });

  it('computeInboxTabCounts ignora o gate (contadores normais mesmo na aba Arquivados)', () => {
    const counts = computeInboxTabCounts(buildPipelineOptions(convs, true) as never);
    // 'open' conta a ativa (a2); arquivadas não poluem os contadores.
    expect(counts.open).toBe(1);
    expect(counts.unread).toBe(0);
  });
});
