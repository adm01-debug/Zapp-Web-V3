// @ts-nocheck
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Retorna os IDs (profiles.id) de todos os colaboradores do mesmo
 * departamento do usuário logado, incluindo o próprio usuário.
 *
 * Usado para escopo "Departamento" no Inbox (supervisor / coordenador
 * vê as conversas atribuídas a si E aos demais colaboradores do
 * próprio departamento).
 *
 * IMPORTANTE: o array retornado em `agentIds` é memoizado via useMemo.
 * Sem isso, `query.data ?? fallbackArray` criava uma NOVA referência de
 * array em cada render quando query.data era undefined, o que causava um
 * loop infinito em RealtimeInboxView.tsx (useEffect dependia do array →
 * setState → re-render → novo array → setState → infinite loop).
 */
export function useDepartmentAgents() {
  const { profile } = useAuth();
  const departmentId = profile?.department_id ?? null;

  const query = useQuery({
    queryKey: ['department-agents', departmentId],
    enabled: !!departmentId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!departmentId) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('department_id', departmentId);
      if (error) throw error;
      return (data ?? []).map((r) => r.id as string);
    },
  });

  // CRÍTICO: useMemo estabiliza a referência do array entre renders.
  // Quando query.data é undefined (loading / sem departamento), o fallback
  // [profile.id] seria uma nova instância a cada render sem o memo, o que
  // disparava o loop de re-render em RealtimeInboxView.tsx.
  const ids = useMemo(
    () => query.data ?? (profile?.id ? [profile.id] : []),
    [query.data, profile?.id]
  );

  return {
    agentIds: ids,
    departmentId,
    loading: query.isLoading,
  };
}
