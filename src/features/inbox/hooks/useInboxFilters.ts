import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { InboxFiltersState } from '@/features/inbox';
import { ConversationWithMessages } from '@/features/inbox';
import { parseISO } from 'date-fns';
import { MainTab, SubTab } from '@/features/inbox';
import { useFailureMetricsBatch, type FailureCategory } from '@/features/inbox';
import { useAllTicketStates } from '@/features/inbox';
import { usePermissions } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import {
  CHANNEL_PERMISSION_KEYS,
  applyInboxFilters,
  buildFailureCategoryCounts,
  computeInboxTabCounts,
} from './inboxFilterPipeline';

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
  const {
    hasPermission,
    loading: permissionsLoading,
    userPermissions,
    permissions,
  } = usePermissions();
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

    if (params.has('subTab')) {
      params.delete('subTab');
      window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
    }

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

  const enforceChannelPermissions = useMemo(() => {
    if (permissionsLoading) return false;
    const knownPermissionNames = new Set([
      ...(permissions ?? []).map((permission) => permission.name),
      ...(userPermissions ?? []),
    ]);
    return CHANNEL_PERMISSION_KEYS.every((permission) => knownPermissionNames.has(permission));
  }, [permissions, permissionsLoading, userPermissions]);

  const pipelineOptions = useMemo(
    () => ({
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
      permissionsLoading,
      enforceChannelPermissions,
    }),
    [
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
      permissionsLoading,
      enforceChannelPermissions,
    ]
  );

  const inboxTabCounts = useMemo(() => computeInboxTabCounts(pipelineOptions), [pipelineOptions]);

  useEffect(() => {
    if (mainTab !== 'open' || conversations.length === 0) return;

    if (subTab === 'attending' && inboxTabCounts.attending === 0 && inboxTabCounts.waiting > 0) {
      setSubTab('waiting');
      return;
    }

    if (subTab === 'waiting' && inboxTabCounts.waiting === 0 && inboxTabCounts.attending > 0) {
      setSubTab('attending');
    }
  }, [mainTab, subTab, conversations.length, inboxTabCounts.attending, inboxTabCounts.waiting]);

  const filteredConversations = useMemo(
    () => applyInboxFilters(pipelineOptions),
    [pipelineOptions]
  );

  const retryingCount = useMemo(
    () =>
      conversations.filter((c) =>
        c.messages?.some((m) => m.status === 'retrying' || m.status === 'failed_retries')
      ).length,
    [conversations]
  );

  // Contagem por categoria (apenas quando filtro retry está ativo e métricas carregadas)
  const failureCategoryCounts = useMemo(() => {
    return buildFailureCategoryCounts({
      conversations,
      showOnlyRetrying,
      failureCategoryById,
    });
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
    inboxTabCounts,
    customScopes,
    clearUrlFilters,
  };
}
