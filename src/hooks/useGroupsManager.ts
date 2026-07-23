import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { log } from '@/lib/logger';
import { toast } from 'sonner';
import { useGroupActions } from './groups/actions';
import type { WhatsAppGroup, WhatsAppConnection } from './groups/types';

// Re-export for external consumers
/** Re-exported module members. */
export type { WhatsAppGroup, WhatsAppConnection } from './groups/types';
/** Re-exported module members. */
export { GROUP_CATEGORIES } from './groups/types';

const GROUPS_KEY = ['whatsapp-groups'] as const;
const CONNECTIONS_KEY = ['whatsapp-connections-groups'] as const;

/** Manages WhatsApp groups with filtering, selection, and bulk action capabilities. */
export function useGroupsManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const { data: groups = [], isLoading } = useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async () => {
      const { data, error } = await safeClient.from<WhatsAppGroup>('whatsapp_groups', (q) =>
        q.select('*').order('name', { ascending: true })
      );
      if (error) {
        toast.error('Erro ao carregar grupos');
        log.error('Error fetching groups:', error);
        return [] as WhatsAppGroup[];
      }
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: connections = [] } = useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: async () => {
      const { data, error } = await safeClient.from<WhatsAppConnection>(
        'whatsapp_connections',
        (q) =>
          q
            .select('id, name, phone_number, instance_id, instance_name')
            .order('name', { ascending: true })
      );
      if (error) log.error('Error fetching connections:', error);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const fetchGroups = useCallback(
    () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
    [queryClient]
  );

  const actions = useGroupActions({
    connections,
    groups,
    selectedGroups,
    setGroups: (updater: WhatsAppGroup[] | ((prev: WhatsAppGroup[]) => WhatsAppGroup[])) => {
      queryClient.setQueryData(GROUPS_KEY, (prev: WhatsAppGroup[] | undefined) =>
        typeof updater === 'function' ? updater(prev ?? []) : updater
      );
    },
    setSelectedGroups,
    fetchGroups,
  });

  const filteredGroups = groups.filter((group) => {
    const matchesSearch =
      group.name.toLowerCase().includes(search.toLowerCase()) || group.group_id.includes(search);
    const matchesCategory =
      !categoryFilter ||
      (categoryFilter === 'sem_categoria' ? !group.category : group.category === categoryFilter);
    return matchesSearch && matchesCategory;
  });

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectAllGroups = () => {
    if (selectedGroups.size === filteredGroups.length) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(filteredGroups.map((g) => g.id)));
  };

  const getConnectionName = (connectionId: string | null) => {
    if (!connectionId) return 'Não vinculado';
    return connections.find((c) => c.id === connectionId)?.name || 'Desconhecido';
  };

  return {
    groups,
    connections,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    isLoading,
    isSyncing,
    selectedGroups,
    filteredGroups,
    handleAutoSync: () => actions.handleAutoSync(setIsSyncing),
    handleAddGroup: actions.handleAddGroup,
    handleDeleteGroup: actions.handleDeleteGroup,
    handleBroadcast: actions.handleBroadcast,
    handleCategoryChange: actions.handleCategoryChange,
    toggleGroupSelection,
    selectAllGroups,
    getConnectionName,
  };
}
