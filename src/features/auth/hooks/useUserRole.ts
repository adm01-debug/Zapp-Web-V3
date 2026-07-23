import { useMemo } from 'react';
import { useAuth } from './useAuth';

/**
 * Hierarquia de papéis (do mais alto ao mais baixo):
 *
 *   dev        → Equipe técnica. Acesso TOTAL inclusive edição de áreas técnicas
 *                (telemetria, webhook, banco, infra) e informativos do sistema.
 *   admin      → Gestão completa do negócio (pessoas, integrações, configurações).
 *                Vê áreas técnicas em modo leitura. Não edita áreas técnicas.
 *   manager    → Gestor geral. Vê TUDO da empresa em todos os departamentos
 *                (inbox, CRM, relatórios) mas NÃO gerencia usuários nem configurações.
 *   supervisor → Supervisor de DEPARTAMENTO. Vê apenas conversas/contatos do
 *                próprio departamento (dele + agentes do mesmo departamento).
 *   agent      → Atendente final. Apenas o próprio escopo.
 *
 * Cada nível superior herda os acessos dos níveis abaixo.
 */
export type AppRole = 'dev' | 'admin' | 'manager' | 'supervisor' | 'agent';

const ROLE_RANK: Record<AppRole, number> = {
  dev: 5,
  admin: 4,
  manager: 3,
  supervisor: 2,
  agent: 1,
};

/** use User Role function. */
export function useUserRole() {
  const { roles: authRoles, loading, refreshRoles } = useAuth();

  const roles = useMemo(() => {
    return authRoles.map(r => (r === 'special_agent' ? 'agent' : r) as AppRole);
  }, [authRoles]);

  const maxRank = useMemo(() => {
    return roles.reduce(
      (acc, r) => Math.max(acc, ROLE_RANK[r] ?? 0),
      0
    );
  }, [roles]);

  const hasRole = useMemo(() => (role: AppRole) => {
    const required = ROLE_RANK[role] ?? 0;
    return roles.some((r) => (ROLE_RANK[r] ?? 0) >= required);
  }, [roles]);

  return {
    roles,
    isDev: maxRank >= ROLE_RANK.dev,
    isAdmin: maxRank >= ROLE_RANK.admin,
    isManager: maxRank >= ROLE_RANK.manager,
    isSupervisor: maxRank >= ROLE_RANK.supervisor,
    /** @deprecated O papel `special_agent` foi descontinuado. Sempre retorna `false`. */
    isSpecialAgent: false,
    hasRole,
    loading,
    refetch: refreshRoles,
  };
}
