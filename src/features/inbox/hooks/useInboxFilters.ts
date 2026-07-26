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
import {
  resolveInitialInboxFilters,
  resolveInitialScope,
  resolveInitialShowAll,
  sanitizeInboxUrlParams,
  writeStoredInboxFilters,
} from './inboxFilterPersistence';
import {
  readInboxPresets,
  writeInboxPresets,
  upsertInboxPreset,
  removeInboxPreset,
  type InboxFilterPreset,
} from './inboxFilterPresets';
import {
  fetchRemoteInboxPresets,
  upsertRemoteInboxPreset,
  deleteRemoteInboxPreset,
  mergeInboxPresets,
  pushLocalOnlyPresets,
} from './inboxPresetsSync';


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
  // Sanitiza a URL antes de qualquer leitura: links antigos/manipulados podem
  // trazer valores inválidos que gerariam estados impossíveis na Inbox.
  const sanitizedSearch = useRef<string>(
    (() => {
      const { search, removed } = sanitizeInboxUrlParams(window.location.search);
      if (removed.length > 0) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
        );
      }
      return search;
    })()
  ).current;

  // Estado inicial restaurado da URL (prioridade) ou do localStorage.
  const initialPersisted = useRef(resolveInitialInboxFilters(sanitizedSearch)).current;

  const [mainTab, setMainTab] = useState<MainTab>(initialPersisted.mainTab ?? 'open');
  // Default 'waiting': funciona tanto para DB local (não atribuídos) quanto para
  // a fonte Evolution externa (contatos derivados com assigned_to = null).
  // Evita que a tela abra vazia em 'Atendendo + mine' quando ninguém está atribuído.
  const [subTab, setSubTab] = useState<SubTab>(initialPersisted.subTab ?? 'waiting');
  // Nota: o auto-switch abaixo só atua quando a sub-aba restaurada está vazia,
  // então a escolha persistida do usuário é preservada sempre que houver dados.

  const [showAll, setShowAll] = useState(() => resolveInitialShowAll(sanitizedSearch));
  const [scope, setScope] = useState<string>(() => resolveInitialScope(sanitizedSearch));

  const {
    hasPermission,
    loading: permissionsLoading,
    userPermissions,
    permissions,
  } = usePermissions();
  const [departmentAgentIds, setDepartmentAgentIds] = useState<string[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(
    initialPersisted.queueId
  );
  const [selectedContactType, setSelectedContactType] = useState<string | null>(
    initialPersisted.contactType
  );
  const [showOnlyRetrying, setShowOnlyRetrying] = useState(
    initialPersisted.showOnlyRetrying ?? false
  );
  const [failureCategoryFilter, setFailureCategoryFilter] = useState<FailureCategory | 'all'>(
    initialPersisted.failureCategory ?? 'all'
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

  // Persistência: reflete aba/sub-aba/fila/tipo na URL (links compartilháveis)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    const setOrDelete = (key: string, value: string | null) => {
      if (value) {
        if (params.get(key) !== value) {
          params.set(key, value);
          changed = true;
        }
      } else if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    };

    setOrDelete('tab', mainTab === 'open' ? null : mainTab);
    setOrDelete('subTab', subTab);
    setOrDelete('type', selectedContactType);
    setOrDelete('queue', selectedQueueId);

    if (changed) {
      window.history.replaceState(null, '', `?${params.toString()}${window.location.hash}`);
    }
  }, [mainTab, subTab, selectedContactType, selectedQueueId]);


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

  // Load custom scopes (separate key from useInboxDataQueries to avoid partial-result collision)
  const { data: customScopes = [] } = useQuery({
    queryKey: ['inbox-custom-scopes-full'],
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

  // Load full contact_tags mapping (separate key from useInboxDataQueries which is conversation-scoped)
  const { data: contactTagsMap = {} } = useQuery({
    queryKey: ['contact-tags-map-full'],
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

  // Restaura a busca persistida quando a URL não traz `q` (ex.: troca de rota)
  const searchRestoredRef = useRef(false);
  useEffect(() => {
    if (searchRestoredRef.current) return;
    searchRestoredRef.current = true;
    const stored = initialPersisted.search;
    if (stored && !search) setSearch(stored);
  }, [initialPersisted.search, search, setSearch]);

  // Persiste o conjunto completo de filtros no localStorage
  useEffect(() => {
    writeStoredInboxFilters({
      mainTab,
      subTab,
      search,
      contactType: selectedContactType,
      queueId: selectedQueueId,
      showOnlyRetrying,
      failureCategory: failureCategoryFilter,
    });
  }, [
    mainTab,
    subTab,
    search,
    selectedContactType,
    selectedQueueId,
    showOnlyRetrying,
    failureCategoryFilter,
  ]);


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

  /**
   * Fallback único para o estado restaurado (URL/localStorage): se a aba principal
   * restaurada (Não lidas/Resolvidos) estiver vazia mas houver conversas em Abertos,
   * volta para 'open' para não abrir a Inbox vazia após um reload.
   * Só roda uma vez, preservando a navegação manual posterior do usuário.
   */
  const restoredTabCheckedRef = useRef(false);
  useEffect(() => {
    if (restoredTabCheckedRef.current) return;
    if (conversations.length === 0) return;
    restoredTabCheckedRef.current = true;

    if (mainTab === 'open') return;
    const restoredCount = mainTab === 'unread' ? inboxTabCounts.unread : inboxTabCounts.resolved;
    const openCount = Math.max(inboxTabCounts.attending, inboxTabCounts.waiting);
    if (mainTab !== 'search' && restoredCount === 0 && openCount > 0) {
      log.info('Aba restaurada vazia; retornando para "Abertos"', { mainTab });
      setMainTab('open');
    }
  }, [
    mainTab,
    conversations.length,
    inboxTabCounts.unread,
    inboxTabCounts.resolved,
    inboxTabCounts.attending,
    inboxTabCounts.waiting,
  ]);

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

  /** Indica se algum filtro difere do padrão (habilita o botão "Limpar filtros"). */
  const hasActiveInboxFilters = useMemo(
    () =>
      mainTab !== 'open' ||
      subTab !== 'waiting' ||
      !!search ||
      !!selectedContactType ||
      !!selectedQueueId ||
      showOnlyRetrying ||
      failureCategoryFilter !== 'all' ||
      !!filters.agentId ||
      filters.status.length > 0 ||
      filters.tags.length > 0 ||
      !!filters.dateRange.from ||
      !!filters.dateRange.to,
    [
      mainTab,
      subTab,
      search,
      selectedContactType,
      selectedQueueId,
      showOnlyRetrying,
      failureCategoryFilter,
      filters,
    ]
  );

  /**
   * Reseta aba, sub-aba, busca e filtros auxiliares para o padrão,
   * limpando também a URL e o snapshot no localStorage.
   */
  const resetInboxFilters = useCallback(() => {
    setMainTab('open');
    setSubTab('waiting');
    setSelectedContactType(null);
    setSelectedQueueId(null);
    setShowOnlyRetrying(false);
    setFailureCategoryFilter('all');

    writeStoredInboxFilters({
      mainTab: 'open',
      subTab: 'waiting',
      search: '',
      contactType: null,
      queueId: null,
      showOnlyRetrying: false,
      failureCategory: 'all',
    });

    // Limpa os parâmetros gerenciados pelo useUrlFilters (q, status, tags, agent, datas)
    clearUrlFilters();

    // Limpa os parâmetros próprios da Inbox mantidos via history.replaceState
    const params = new URLSearchParams(window.location.search);
    ['tab', 'subTab', 'type', 'queue', 'failuresOnly', 'failureCategory', 'q'].forEach((key) =>
      params.delete(key)
    );
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    );

    log.info('Filtros da Inbox resetados para o padrão');
  }, [clearUrlFilters]);

  // ===================== Presets de filtros =====================
  const [presets, setPresets] = useState<InboxFilterPreset[]>(() => readInboxPresets());

  // Sincronização inicial com o backend (presets seguem o usuário entre dispositivos).
  useEffect(() => {
    let active = true;
    void (async () => {
      const remote = await fetchRemoteInboxPresets();
      if (!active || remote === null) return;
      const local = readInboxPresets();
      const merged = mergeInboxPresets(local, remote);
      writeInboxPresets(merged);
      setPresets(merged);
      await pushLocalOnlyPresets(local, remote);
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Salva a combinação atual de filtros com o nome informado. */
  const saveInboxPreset = useCallback(
    (name: string) => {
      let created: InboxFilterPreset | undefined;
      setPresets((current) => {
        const next = upsertInboxPreset(current, {
          name,
          mainTab,
          subTab,
          search: search ?? '',
          contactType: selectedContactType,
          queueId: selectedQueueId,
          showOnlyRetrying,
          failureCategory: failureCategoryFilter,
        });
        writeInboxPresets(next);
        created = next[0];
        return next;
      });
      if (created) void upsertRemoteInboxPreset(created);
    },
    [
      mainTab,
      subTab,
      search,
      selectedContactType,
      selectedQueueId,
      showOnlyRetrying,
      failureCategoryFilter,
    ]
  );

  /** Aplica um preset salvo (estado + URL + localStorage). */
  const applyInboxPreset = useCallback(
    (preset: InboxFilterPreset) => {
      setMainTab(preset.mainTab);
      setSubTab(preset.subTab);
      setSelectedContactType(preset.contactType);
      setSelectedQueueId(preset.queueId);
      setShowOnlyRetrying(preset.showOnlyRetrying);
      setFailureCategoryFilter(preset.failureCategory);
      setSearch(preset.search ?? '');

      writeStoredInboxFilters({
        mainTab: preset.mainTab,
        subTab: preset.subTab,
        search: preset.search ?? '',
        contactType: preset.contactType,
        queueId: preset.queueId,
        showOnlyRetrying: preset.showOnlyRetrying,
        failureCategory: preset.failureCategory,
      });

      log.info('Preset de filtros aplicado', { name: preset.name });
    },
    [setSearch]
  );

  /** Remove um preset salvo (local + remoto). */
  const deleteInboxPreset = useCallback((id: string) => {
    setPresets((current) => {
      const next = removeInboxPreset(current, id);
      writeInboxPresets(next);
      return next;
    });
    void deleteRemoteInboxPreset(id);
  }, []);


  return {
    presets,
    saveInboxPreset,
    applyInboxPreset,
    deleteInboxPreset,
    hasActiveInboxFilters,
    resetInboxFilters,
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
