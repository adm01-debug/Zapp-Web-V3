import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { fromTable } from '@/lib/supabaseHelpers';
import { unwrapRows } from '@/lib/supabase-helpers';
import { toast } from 'sonner';

// Maps entity types to the query keys that cache that entity's data.
// When a version is restored, we invalidate both the version history and the entity's own cache.
const ENTITY_QUERY_KEYS: Record<string, readonly unknown[]> = {
  profiles: queryKeys.adminOps.agentVersions(),
  automations: queryKeys.automations.all(),
  sla_configurations: queryKeys.sla.configurations(),
  chatbot_flows: queryKeys.chatbotFlows.all(),
  contacts: queryKeys.contacts.all(),
};

export interface Version {
  id: string;
  entity_type: string;
  entity_id: string;
  version_number: number;
  data: Record<string, unknown>;
  changed_by: string | null;
  created_at: string;
  change_summary: string | null;
}

export function useVersions(entityType: string, entityId: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.versions.forEntity(entityType, entityId);

  const { data: versions = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await fromTable('entity_versions')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return unwrapRows<Version>(data);
    },
    enabled: !!entityId,
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const version = versions.find((v) => v.id === versionId);
      if (!version) throw new Error('Versão não encontrada');

      const { error } = await fromTable(entityType).update(version.data).eq('id', entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      const entityKey = ENTITY_QUERY_KEYS[entityType];
      if (entityKey) {
        queryClient.invalidateQueries({ queryKey: entityKey as readonly unknown[] });
      }
      toast.success('Versão restaurada!');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    versions,
    isLoading,
    restoreVersion: restoreMutation.mutate,
    currentVersion: versions[0],
  };
}
