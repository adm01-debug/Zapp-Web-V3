import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { isDevBypassAllowed } from '@/lib/auth/devBypass';

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
 *
 * E51 (whitelist de ambiente): o papel `dev` só concede bypass e herança de
 * rank em ambientes allowlisted (development/staging). Em produção, decisões
 * de autorização usam apenas papéis EXPLÍCITOS de user_roles — `dev` não
 * "empresta" rank a admin/manager/supervisor.
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

  // E51: bypass do papel dev permitido apenas em ambientes allowlisted.
  const devBypassAllowed = useMemo(() => isDevBypassAllowed(), []);

  // Papéis efetivos para decisões de autorização. Em produção o papel `dev`
  // não contribui com rank (sem herança hierárquica); em dev/staging mantém
  // o comportamento histórico.
  const authzRoles = useMemo(() => {
    if (devBypassAllowed) return roles;
    return roles.filter(r => r !== 'dev');
  }, [roles, devBypassAllowed]);

  const maxRank = useMemo(() => {
    return authzRoles.reduce(
      (acc, r) => Math.max(acc, ROLE_RANK[r] ?? 0),
      0
    );
  }, [authzRoles]);

  const hasRole = useMemo(() => (role: AppRole) => {
    // `dev` é identidade explícita (user_roles) em qualquer ambiente; o
    // bypass em si é decidido pelo chamador via isDevBypassAllowed().
    if (role === 'dev') return roles.includes('dev');
    const required = ROLE_RANK[role] ?? 0;
    return authzRoles.some((r) => (ROLE_RANK[r] ?? 0) >= required);
  }, [roles, authzRoles]);

  return {
    roles,
    isDev: maxRank >= ROLE_RANK.dev && devBypassAllowed,
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
