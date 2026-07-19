/**
 * Mapeamento canônico de papéis para uso em chamadas RPC, gates de UI e
 * verificações de visibilidade. Alinha o hook `useUserRole` com as RPCs
 * `rpc_list_failed_messages`, `rpc_dlq_list_audit` e `rpc_list_transfers_paginated`.
 *
 * Hierarquia: dev > admin > supervisor > agent > viewer
 */

export type CanonicalRole = 'dev' | 'admin' | 'supervisor' | 'agent' | 'viewer';

export const ROLE_RANK: Record<CanonicalRole, number> = {
  dev: 100,
  admin: 80,
  supervisor: 60,
  agent: 40,
  viewer: 20,
};

/** Recursos do Admin que exigem papel >= supervisor. */
export const ADMIN_RESOURCES = {
  dlq: { minRole: 'supervisor' as CanonicalRole, label: 'a DLQ' },
  dlqAudit: { minRole: 'supervisor' as CanonicalRole, label: 'a auditoria da DLQ' },
  transfersAll: { minRole: 'supervisor' as CanonicalRole, label: 'todas as transferências' },
  rlsDeniedLog: { minRole: 'supervisor' as CanonicalRole, label: 'o log de RLS' },
} as const;

export type AdminResource = keyof typeof ADMIN_RESOURCES;

/** can Access Admin Resource function. */
export function canAccessAdminResource(role: CanonicalRole | null | undefined, resource: AdminResource): boolean {
  if (!role) return false;
  const required = ROLE_RANK[ADMIN_RESOURCES[resource].minRole];
  return (ROLE_RANK[role] ?? 0) >= required;
}

/** Retorna o papel mais alto dentre os atribuídos ao usuário. */
export function highestRole(roles: ReadonlyArray<CanonicalRole | string>): CanonicalRole | null {
  let best: CanonicalRole | null = null;
  let bestRank = -1;
  for (const r of roles) {
    const rank = ROLE_RANK[r as CanonicalRole];
    if (rank != null && rank > bestRank) {
      bestRank = rank;
      best = r as CanonicalRole;
    }
  }
  return best;
}
