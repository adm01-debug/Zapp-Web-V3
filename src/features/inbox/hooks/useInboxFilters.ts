import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { parseISO } from 'date-fns';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { InboxFiltersState } from '@/features/inbox';
import { ConversationWithMessages } from '@/features/inbox';
import { MainTab, SubTab, type InboxScope } from '@/features/inbox';
import { useFailureMetricsBatch, type FailureCategory } from '@/features/inbox';
import { useAllTicketStates } from '@/features/inbox';
import { usePermissions } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { applyInboxFilters, buildFailureCategoryCounts } from './inboxFilterPipeline';
import { useInboxDataQueries } from './useInboxDataQueries';

const log = getLogger('useInboxFilters');

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  search?: string;
  sortBy?: 'lastMessage' | 'name' | 'unread';
  statusFilter?: 'all' | 'open' | 'closed' | 'unread';
}

/** Computes and manages the full inbox filter state — tabs, scope, URL params, failure categories, contact type — and returns the deduplicated filtered conversation list. */
export function useInboxFilters({
  conversations,
  profileId,
  search: externalSearch,
  sortBy,
  statusFilter,
}: UseInboxFiltersProps) {
  const [mainTab, setMainTab] = useState<MainTab>('open');
  const [subTab, setSubTab] = useState<SubTab>('attending');
  const [showAll, setShowAll] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('showAll') === 'true' || localStorage.getItem('inbox_show_all') === 'true';
  });
  const [scope, setScope] = useState<InboxScope>(() => {
    const params = new URLSearchParams(window.location.search);
    const scopeParam = params.get('scope');
    const storedScope = scopeParam || localStorage.getItem('inbox_scope');
    return storedScope === 'department' || storedScope === 'all' || storedScope === 'mine'
      ? storedScope
      : 'mine';
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

  // Sync URL → state on mount only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeFromUrl = params.get('type');
    if (typeFromUrl && typeFromUrl !== 'all') setSelectedContactType(typeFromUrl);
    if (params.get('failuresOnly') === 'true') {
      log.info('Deep-link: filtering by failures only');
      setShowOnlyRetrying(true);
    }
    const catFromUrl = params.get('failureCategory');
    if (catFromUrl) {
      const valid: (FailureCategory | 'all')[] = [
        'all',
        'auth',
        'http_4xx',
        'http_5xx',
        'network',
        'unknown',
      ];
      if ((valid as string[]).includes(catFromUrl)) {
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

  // Sync failure filters → URL
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
    if (changed)
      window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
  }, [showOnlyRetrying, failureCategoryFilter]);

  // Sync scope/showAll → URL + localStorage
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
    if (changed)
      window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
  }, [showAll, scope]);

  const { data: failureCategoryById = {} } = useFailureMetricsBatch(
    conversations,
    showOnlyRetrying
  );
  const { customScopes, contactTagsMap } = useInboxDataQueries(conversations);
  const ticketStates = useAllTicketStates();

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
    (value: string) => setUrlFilters({ search: value }),
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

  const filteredConversations = useMemo(() => {
    log.debug('Recomputing filtered conversations', {
      total: conversations.length,
      mainTab,
      subTab,
      showOnlyRetrying,
      failureCategoryFilter,
    });
    return applyInboxFilters({
      conversations,
      profileId,
      externalSearch,
      search,
      sortBy,
      statusFilter,
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
      filters,
      contactTagsMap,
      ticketStates,
      customScopes,
      hasPermission,
    });
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
    customScopes,
  ]);

  const retryingCount = useMemo(
    () =>
      conversations.filter((c) =>
        c.messages?.some((m) => m.status === 'retrying' || m.status === 'failed_retries')
      ).length,
    [conversations]
  );

  const failureCategoryCounts = useMemo(
    () => buildFailureCategoryCounts({ conversations, showOnlyRetrying, failureCategoryById }),
    [conversations, showOnlyRetrying, failureCategoryById]
  );

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
