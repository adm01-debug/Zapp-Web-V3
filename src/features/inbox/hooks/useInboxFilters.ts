import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { InboxFiltersState } from '@/features/inbox';
import { ConversationWithMessages } from '@/features/inbox';
import { filterByContactType } from '@/features/inbox';
import { isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { MainTab, SubTab } from '@/features/inbox';
import { useFailureMetricsBatch, type FailureCategory } from '@/features/inbox';
import { useAllTicketStates } from '@/features/inbox';
import { usePermissions } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';

const log = getLogger('useInboxFilters');

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  search?: string;
  sortBy?: 'lastMessage' | 'name' | 'unread';
  statusFilter?: 'all' | 'open' | 'closed' | 'unread';
}

export function useInboxFilters({
  conversations,
  profileId,
  search: externalSearch,
  sortBy,
  statusFilter,
}: UseInboxFiltersProps) {
  const [mainTab, setMainTab] = useState<MainTab>('open');
  // Default 'waiting': funciona tanto para DB local (não atribuídos) quanto para
  // a fonte Evolution externa (contatos derivados com assigned_to = null).
  // Evita que a tela abra vazia em 'Atendendo + mine' quando ninguém está atribuído.
  const [subTab, setSubTab] = useState<SubTab>('waiting');
  const [showAll, setShowAll] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('showAll') === 'true' || localStorage.getItem('inbox_show_all') === 'true';
  });
  const [scope, setScope] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const scopeParam = params.get('scope');
    if (scopeParam) return scopeParam;
    return localStorage.getItem('inbox_scope') || 'mine';
  });
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [departmentAgentIds, setDepartmentAgentIds] = useState<string[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [selectedContactType, setSelectedContactType] = useState<string | null>(null);
  const [showOnlyRetrying, setShowOnlyRetrying] = useState(false);
  const [failureCategoryFilter, setFailureCategoryFilter] = useState<FailureCategory | 'all'>(
    'all'
  );

  const {
    filters: urlFilters,
    setFilters: setUrlFilters,
    clearFilters: clearUrlFilters,
  } = useUrlFilters();
  const prevScopeRef = useRef(scope);

  // Security: Enforce permissions on scope and showAll
  useEffect(() => {
    if (permissionsLoading) return;

    const canSeeDept = hasPermission('inbox.view_department');
    const canSeeAll = hasPermission('inbox.view_all');

    if (showAll && !canSeeAll) {
      log.warn('[SECURITY] User attempted to show all departments without permission');
      setShowAll(false);
    }

    if (scope === 'department' && !canSeeDept && !canSeeAll) {
      log.warn('[SECURITY] User attempted to view department scope without permission');
      setScope('mine');
    } else if (scope === 'all' && !canSeeAll) {
      log.warn('[SECURITY] User attempted to view all scope without permission');
      setScope(canSeeDept ? 'department' : 'mine');
    }
  }, [scope, showAll, hasPermission, permissionsLoading]);

  useEffect(() => {
    if (prevScopeRef.current !== scope) {
      log.info('Scope changed', { from: prevScopeRef.current, to: scope });
      logAudit({
        action: 'scope_change',
        details: { from: prevScopeRef.current, to: scope, module: 'inbox' },
      });
      prevScopeRef.current = scope;
    }
  }, [scope]);

  // Carrega categorias de falha em lote quando o filtro de retry está ativo
  const { data: failureCategoryById = {} } = useFailureMetricsBatch(
    conversations,
    showOnlyRetrying
  );

  // Sync state with URL on mount only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Contact Type
    const typeFromUrl = params.get('type');
    if (typeFromUrl && typeFromUrl !== 'all') {
      setSelectedContactType(typeFromUrl);
    }

    // Failures Only (deep-link de monitoramento)
    if (params.get('failuresOnly') === 'true') {
      log.info('Deep-link: filtering by failures only');
      setShowOnlyRetrying(true);
    }

    // Failure Category (deep-link de monitoramento)
    const catFromUrl = params.get('failureCategory');
    if (catFromUrl) {
      const validCategories: (FailureCategory | 'all')[] = [
        'all',
        'auth',
        'http_4xx',
        'http_5xx',
        'network',
        'unknown',
      ];
      if (validCategories.includes(catFromUrl as FailureCategory | 'all')) {
        setFailureCategoryFilter(catFromUrl as FailureCategory | 'all');
      }
    }
  }, []);

  const handleContactTypeChange = useCallback((value: string | null) => {
    setSelectedContactType(value);

    const params = new URLSearchParams(window.location.search);
    if (value && value !== 'all') {
      params.set('type', value);
    } else {
      params.delete('type');
    }
    window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
  }, []);

  // Sync URL when failure filters change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (showOnlyRetrying) {
      if (params.get('failuresOnly') !== 'true') {
        params.set('failuresOnly', 'true');
        changed = true;
      }
    } else if (params.has('failuresOnly')) {
      params.delete('failuresOnly');
      changed = true;
    }

    if (failureCategoryFilter !== 'all') {
      if (params.get('failureCategory') !== failureCategoryFilter) {
        params.set('failureCategory', failureCategoryFilter);
        changed = true;
      }
    } else if (params.has('failureCategory')) {
      params.delete('failureCategory');
      changed = true;
    }

    if (changed) {
      window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
    }
  }, [showOnlyRetrying, failureCategoryFilter]);

  // Sync scope/showAll with URL and localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (showAll) {
      if (params.get('showAll') !== 'true') {
        params.set('showAll', 'true');
        changed = true;
      }
      localStorage.setItem('inbox_show_all', 'true');
    } else {
      if (params.has('showAll')) {
        params.delete('showAll');
        changed = true;
      }
      localStorage.setItem('inbox_show_all', 'false');
    }

    if (params.get('scope') !== scope) {
      params.set('scope', scope);
      changed = true;
    }
    localStorage.setItem('inbox_scope', scope);

    if (changed) {
      window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
    }
  }, [showAll, scope]);

  // Load custom scopes
  const { data: customScopes = [] } = useQuery({
    queryKey: ['inbox-custom-scopes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbox_custom_scopes')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // Load contact_tags mapping
  const { data: contactTagsMap = {} } = useQuery({
    queryKey: ['contact-tags-map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contact_tags').select('contact_id, tag_id');
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data || []).forEach((ct) => {
        if (!map[ct.contact_id]) map[ct.contact_id] = [];
        map[ct.contact_id].push(ct.tag_id);
      });
      return map;
    },
    staleTime: 30_000,
  });

  // Convert URL filters to InboxFiltersState
  const filters = useMemo<InboxFiltersState>(
    () => ({
      status: urlFilters.status,
      tags: urlFilters.tags,
      agentId: urlFilters.agentId,
      dateRange: {
        from: urlFilters.dateFrom ? parseISO(urlFilters.dateFrom) : null,
        to: urlFilters.dateTo ? parseISO(urlFilters.dateTo) : null,
      },
    }),
    [urlFilters]
  );

  const search = urlFilters.search;
  const setSearch = useCallback(
    (value: string) => {
      setUrlFilters({ search: value });
    },
    [setUrlFilters]
  );

  const setFilters = useCallback(
    (newFilters: InboxFiltersState) => {
      setUrlFilters({
        status: newFilters.status,
        tags: newFilters.tags,
        agentId: newFilters.agentId,
        dateFrom: newFilters.dateRange.from?.toISOString().split('T')[0] || null,
        dateTo: newFilters.dateRange.to?.toISOString().split('T')[0] || null,
      });
    },
    [setUrlFilters]
  );

  const ticketStates = useAllTicketStates();

  const filteredConversations = useMemo(() => {
    const rawCount = conversations.length;
    let result = conversations.filter((c) => c && c.contact && c.contact.id);
    const afterShapeCount = result.length;

    // 0. Channel visibility filtering (CRITICAL SECURITY: Always apply, even during search)
    // BUG-FIX: while permissions are still loading OR the permission list is empty
    // (session hydration edge case), do NOT apply the deny-by-default filter.
    // Otherwise the entire WhatsApp inbox disappears with no visible reason while
    // counters (which use raw conversations) still show positive numbers.
    let afterChannelPermissionCount = result.length;
    if (!permissionsLoading) {
      const canSeeWhatsapp = hasPermission('inbox.view_whatsapp');
      const canSeeInstagram = hasPermission('inbox.view_instagram');
      const canSeeChat = hasPermission('inbox.view_chat');

      result = result.filter((c) => {
        const channel = c.contact?.channel_type;
        if (channel === 'whatsapp' && !canSeeWhatsapp) return false;
        if (channel === 'instagram' && !canSeeInstagram) return false;
        if ((channel === 'chat' || channel === 'webchat') && !canSeeChat) return false;
        return true;
      });
      afterChannelPermissionCount = result.length;
    }

    log.debug('Recomputing filtered conversations', {
      rawCount,
      afterShapeCount,
      afterChannelPermissionCount,
      permissionsLoading,
      mainTab,
      subTab,
      selectedContactType,
      showOnlyRetrying,
      failureCategoryFilter,
    });

    // Memoize utility functions for current render
    const statusOf = (id: string) => ticketStates[id]?.status ?? 'open';
    const assignedOf = (id: string, fallback: string | null | undefined) => {
      const state = ticketStates[id];
      if (state && state.assignedTo !== undefined) return state.assignedTo;
      return fallback ?? null;
    };
    const effectiveSearch = (externalSearch !== undefined ? externalSearch : search || '').trim();
    const searchTrimmed = effectiveSearch;

    // 1. Tab and Status Filtering
    if (searchTrimmed.length === 0) {
      if (mainTab === 'open') {
        result = result.filter((c) => {
          const s = statusOf(c.contact.id);
          const isOpenOrProgress = s === 'open' || s === 'in_progress';

          if (!isOpenOrProgress) return false;

          // Apply statusFilter if provided (legacy unread button etc)
          if (statusFilter === 'unread' && c.unreadCount === 0) return false;

          if (subTab === 'attending') {
            const canSeeDept = hasPermission('inbox.view_department');
            const canSeeAll = hasPermission('inbox.view_all');

            const effectiveScope =
              showAll && canSeeAll
                ? 'all'
                : scope === 'department' && (canSeeDept || canSeeAll)
                  ? 'department'
                  : scope === 'all' && canSeeAll
                    ? 'all'
                    : 'mine';
            const assignee = assignedOf(c.contact.id, c.contact.assigned_to);

            // 1. Prioridade para filtro de Agente específico (Coordenadores/Supervisores)
            if (filters.agentId) {
              // SECURITY: Only allow filtering by other agents if they have permission
              if (filters.agentId !== profileId && !canSeeDept && !canSeeAll) {
                return assignee === profileId; // Force to current user
              }
              return assignee === filters.agentId;
            }

            // 2. Se não houver agente específico, aplica a lógica de escopo
            if (effectiveScope === 'all') return true;

            if (effectiveScope === 'department') {
              if (!assignee) return false;
              return departmentAgentIds.includes(assignee);
            }

            if (effectiveScope === 'mine') {
              return assignee === profileId;
            }

            // Custom scopes filtering logic
            const customScope = customScopes.find((s) => s.name === effectiveScope);
            if (customScope) {
              return true;
            }

            return assignee === profileId; // Fallback
          }

          if (subTab === 'waiting') {
            return !assignedOf(c.contact.id, c.contact.assigned_to);
          }

          return true;
        });

        if (selectedQueueId) {
          result = result.filter((c) => c.contact.queue_id === selectedQueueId);
        }
      } else if (mainTab === 'resolved') {
        result = result.filter((c) => statusOf(c.contact.id) === 'resolved');
      }
    } else {
      // Quando há busca, filtramos apenas por aberto/resolvido se não estiver na aba de busca
      if (mainTab === 'open') {
        result = result.filter((c) => {
          const s = statusOf(c.contact.id);
          const isOpen = s === 'open' || s === 'in_progress';
          if (!isOpen) return false;
          if (statusFilter === 'unread' && c.unreadCount === 0) return false;

          // SECURITY: In search mode, also enforce scope if not searching globally
          const canSeeDept = hasPermission('inbox.view_department');
          const canSeeAll = hasPermission('inbox.view_all');
          const effectiveScope =
            showAll && canSeeAll
              ? 'all'
              : scope === 'department' && (canSeeDept || canSeeAll)
                ? 'department'
                : 'mine';
          const assignee = assignedOf(c.contact.id, c.contact.assigned_to);

          if (effectiveScope === 'mine' && assignee !== profileId) return false;
          if (effectiveScope === 'department' && assignee && !departmentAgentIds.includes(assignee))
            return false;

          return true;
        });
      } else if (mainTab === 'resolved') {
        result = result.filter((c) => statusOf(c.contact.id) === 'resolved');
      }
    }

    // 2. Search filtering
    if (searchTrimmed) {
      const searchLower = searchTrimmed.toLowerCase();
      const digits = searchTrimmed.replace(/\D/g, '');
      result = result.filter((c) => {
        const name = (c.contact?.name || '').toLowerCase();
        const phone = c.contact?.phone || '';
        const email = (c.contact?.email || '').toLowerCase();
        const jid = String(c.contact?.id || '').toLowerCase();
        const lastMsg = (c.lastMessage?.content || '').toLowerCase();

        const matches =
          name.includes(searchLower) ||
          (digits.length > 0 && phone.replace(/\D/g, '').includes(digits)) ||
          email.includes(searchLower) ||
          jid.includes(searchLower) ||
          lastMsg.includes(searchLower);
        return matches;
      });
    }

    // 3. Status array filter
    if (filters.status.length > 0) {
      result = result.filter((c) => {
        const hasUnread = c.unreadCount > 0;
        const isAssigned = !!c.contact.assigned_to;
        if (filters.status.includes('unread') && hasUnread) return true;
        if (filters.status.includes('read') && !hasUnread && isAssigned) return true;
        if (filters.status.includes('pending') && !isAssigned && c.messages.length > 0) return true;
        if (filters.status.includes('resolved') && c.messages.length === 0) return true;
        return false;
      });
    }

    // 4. Tags filter
    if (filters.tags.length > 0) {
      result = result.filter((c) => {
        const tagIds = contactTagsMap[c.contact.id] || [];
        return filters.tags.some((filterTagId) => tagIds.includes(filterTagId));
      });
    }

    // 5. Agent filter (SECURITY: already handled in step 1, but reinforced here)
    if (filters.agentId) {
      const canSeeDept = hasPermission('inbox.view_department');
      const canSeeAll = hasPermission('inbox.view_all');
      if (filters.agentId === profileId || canSeeDept || canSeeAll) {
        result = result.filter((c) => c.contact.assigned_to === filters.agentId);
      } else {
        result = result.filter((c) => c.contact.assigned_to === profileId);
      }
    }

    // 6. Date range filter
    if (filters.dateRange.from) {
      const fromStart = startOfDay(filters.dateRange.from);
      const toEnd = filters.dateRange.to ? endOfDay(filters.dateRange.to) : null;

      result = result.filter((c) => {
        const lastMessageDate = c.lastMessage
          ? new Date(c.lastMessage.created_at)
          : new Date(c.contact.created_at);
        if (isBefore(lastMessageDate, fromStart)) return false;
        if (toEnd && isAfter(lastMessageDate, toEnd)) return false;
        return true;
      });
    }

    // 7. Contact type filter
    result = filterByContactType(result, selectedContactType);

    // 8. Failure filter
    if (showOnlyRetrying) {
      result = result.filter((c) => {
        const failingMsgs = c.messages.filter(
          (m) =>
            m.status === 'retrying' ||
            m.status === 'failed_retries' ||
            m.status === 'failed' ||
            m.status === 'failed_auth'
        );
        if (failingMsgs.length === 0) return false;

        if (failureCategoryFilter === 'all') return true;

        return failingMsgs.some((m) => {
          if (m.status === 'retrying') return false;
          if (m.status === 'failed_auth' && failureCategoryFilter === 'auth') return true;
          const cat = failureCategoryById[m.id];
          return cat === failureCategoryFilter;
        });
      });
    }

    // 9. Sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'unread') {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      }

      if (sortBy === 'name') {
        return (a.contact.name || '').localeCompare(b.contact.name || '');
      }

      // Default: lastMessage date (descending)
      const aTime = a.lastMessage
        ? new Date(a.lastMessage.created_at).getTime()
        : new Date(a.contact.updated_at).getTime();
      const bTime = b.lastMessage
        ? new Date(b.lastMessage.created_at).getTime()
        : new Date(b.contact.updated_at).getTime();
      return bTime - aTime;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    conversations,
    search,
    externalSearch,
    filters,
    mainTab,
    subTab,
    showAll,
    scope,
    departmentAgentIds,
    selectedQueueId,
    selectedContactType,
    showOnlyRetrying,
    failureCategoryFilter,
    failureCategoryById,
    profileId,
    contactTagsMap,
    ticketStates,
    sortBy,
    statusFilter,
    hasPermission,
    permissionsLoading,
  ]);

  const retryingCount = useMemo(
    () =>
      conversations.filter((c) =>
        c.messages?.some((m) => m.status === 'retrying' || m.status === 'failed_retries')
      ).length,
    [conversations]
  );

  // Contagem por categoria (apenas quando filtro retry está ativo e métricas carregadas)
  const failureCategoryCounts = useMemo(() => {
    const counts: Record<FailureCategory | 'all', number> = {
      all: 0,
      auth: 0,
      http_4xx: 0,
      http_5xx: 0,
      network: 0,
      unknown: 0,
    };
    if (!showOnlyRetrying) return counts;
    const seenConvs = new Set<string>();
    const seenByCat: Record<string, Set<string>> = {
      auth: new Set(),
      http_4xx: new Set(),
      http_5xx: new Set(),
      network: new Set(),
      unknown: new Set(),
    };
    for (const c of conversations) {
      const failing =
        c.messages?.filter(
          (m) =>
            m.status === 'failed' || m.status === 'failed_auth' || m.status === 'failed_retries'
        ) || [];
      if (failing.length === 0) continue;
      seenConvs.add(c.contact.id);
      for (const m of failing) {
        const cat: FailureCategory =
          m.status === 'failed_auth' ? 'auth' : (failureCategoryById[m.id] ?? 'unknown');
        seenByCat[cat].add(c.contact.id);
      }
    }
    counts.all = seenConvs.size;
    counts.auth = seenByCat.auth.size;
    counts.http_4xx = seenByCat.http_4xx.size;
    counts.http_5xx = seenByCat.http_5xx.size;
    counts.network = seenByCat.network.size;
    counts.unknown = seenByCat.unknown.size;
    return counts;
  }, [conversations, showOnlyRetrying, failureCategoryById]);

  return {
    mainTab,
    setMainTab,
    subTab,
    setSubTab,
    showAll,
    setShowAll,
    scope,
    setScope,
    departmentAgentIds,
    setDepartmentAgentIds,
    selectedQueueId,
    setSelectedQueueId,
    selectedContactType,
    handleContactTypeChange,
    showOnlyRetrying,
    setShowOnlyRetrying,
    failureCategoryFilter,
    setFailureCategoryFilter,
    failureCategoryCounts,
    retryingCount,
    filters,
    setFilters,
    search,
    setSearch,
    filteredConversations,
    customScopes,
    clearUrlFilters,
  };
}
