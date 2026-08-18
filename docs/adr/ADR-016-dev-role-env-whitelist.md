# ADR-016: Whitelist de ambiente para o bypass do papel `dev`

**Data:** 2026-08-18
**Status:** Decidido
**Decisor:** Joaquim
**Etapa:** E51 (PLANO-100-ETAPAS-ZAPP) — findings A16 (04-features-auth A7 L511-520) e A17 (A5 L498-505)

## Contexto

`user_roles='dev'` concedia acesso irrestrito a rotas protegidas em **qualquer**
ambiente: o `ProtectedRoute` tinha bypass incondicional (`'dev' always has access`,
antes `ProtectedRoute.tsx:289-311`) e o rank hierárquico do `useUserRole` fazia o
papel `dev` herdar admin/manager/supervisor. Em produção isso significa que um
usuário com `dev` (atribuído indevidamente ou vazado) navega a aplicação inteira.

A safety net de 10s do `ProtectedRoute` redirecionava para `/auth?reason=timeout`
sem guard `pathname !== '/auth'` — montagem sobre `/auth` causaria loop de redirect.

## Contrato de autorização atual (51.1) — pontos de bypass mapeados

| # | Ponto | Antes (E51) | Depois (E51) |
|---|---|---|---|
| 1 | `ProtectedRoute` bypass incondicional (dev) | `hasRole('dev')` → acesso total | `hasRole('dev') && isDevBypassAllowed()` → só development/staging |
| 2 | `ProtectedRoute` checagem de requiredRoles | `hasRole('dev') \|\| effectiveRoles.some(...)` | `effectiveRoles.some(hasRole)` — dev sem rank em prod |
| 3 | `useUserRole` rank hierárquico | dev rank 5 herda TUDO (isDev/isAdmin/isManager) | em prod, `dev` é removido dos papéis de autorização (rank só de papéis explícitos) |
| 4 | `useUserRole.isDev` (gates de UI/dados: monitoring hooks, SecurityView, Connections bridge) | `true` para dev em qualquer env | `maxRank >= dev && isDevBypassAllowed()` — `false` em prod |
| 5 | `useUserRole.hasRole('dev')` (identidade) | rank-based | `roles.includes('dev')` — identidade explícita preservada |
| 6 | Safety net 10s | redirect sem guard | `pathname !== '/auth'` + fallback com saída (anti-loop) |
| 7 | Auditoria | `dev_bypass_used` status `bypassed` (uso) | + `dev_bypass_used` status `blocked` (tentativa bloqueada em prod, 51.7) |

Fora de escopo (sem bypass direto, mas valem conferência):
- `src/hooks/useConnections.ts` `checkUserHasAdminRole` (`role === 'admin' || role === 'dev'`) — gate de UI de conexões.
- `src/hooks/useAppBootstrap.ts:117` `isAdmin` (`admin || dev`) — não consumido fora do hook (verificado 18/08).
- `user_has_permission` (DB, `20260806950000`): SEM wildcard dev — join explícito em `role_permissions` ✓.

## Decisão

1. **Allowlist de ambientes** (`src/lib/auth/devBypass.ts`): `isDevBypassAllowed()`
   retorna `true` **apenas** quando o ambiente efetivo ∈ {development, staging}.
   Resolução: `VITE_APP_ENV` (explícito no build) → fallback `import.meta.env.MODE`
   → default `production` (fail-closed). Nada reconhecido = produção.
2. **Guards**: `ProtectedRoute` (bypass + requiredRoles) e `useUserRole`
   (rank/hasRole/isDev) passam a consultar `isDevBypassAllowed()`. Em produção o
   papel `dev` segue valendo apenas onde houver **grant explícito**
   (`route_permissions` com `dev`, `role_permissions` via `user_has_permission`,
   ou `user_roles` com outro papel explícito).
3. **Anti-loop**: a safety net não redireciona quando `location.pathname === '/auth'`;
   renderiza fallback com "Sair e tentar novamente".
4. **Auditoria**: tentativa de bypass bloqueada em produção loga
   `log_security_event('dev_bypass_used', status='blocked')` (throttle por path/sessão).
5. **Sem mudança de schema** (51.9): restrição de atribuição da role `dev` no banco
   (apenas admin/whitelist) **não** foi implementada — exige evidência prévia de
   como `user_roles` é gravada (admin UI/RPC). Recomenda-se revogar `user_roles='dev'`
   de contas de produção que não sejam de engenharia ativa e conferir no banco se o
   seed de `role_permissions` para `dev` cobre TODAS as permissões (se cobrir, o RPC
   `user_has_permission` continua concedendo em prod — validação via Supabase MCP).

## Consequências

- ✅ Fecha A16 (bypass dev sem whitelist) e A17 (anti-loop) no frontend.
- ✅ Dev/staging continuam com comportamento histórico (bypass total).
- ✅ Builds de produção já carregam `VITE_APP_ENV=production`
  (Dockerfile:20, `.github/workflows/deploy-vps.yml:102`, `deploy-vps-selfhosted.yml:121`) —
  o guard cai bloqueado em prod sem mudança de deploy.
- ⚠️ Em produção, usuário dev-only perde UI dev-gated (monitoring/DLQ, bridge, seções
  de SecurityView) — comportamento desejado; usuários que precisarem de acesso em prod
  devem receber papel explícito ou permissão via `role_permissions`/`route_permissions`.
- ⚠️ GAP (51.10): validação runtime em produção (login dev → bloqueio em prod,
  liberação em dev) fica pendente — requer conta de teste + browser/MCP.
- ⚠️ GAP DB: conferir seed de `role_permissions` do `dev` e contas `dev` em prod
  (ver Decisão item 5).
- 🔧 Testes: `src/lib/auth/__tests__/devBypass.test.ts` (parametrizado dev/staging/
  prod/test), `src/features/auth/hooks/__tests__/useUserRole.devBypass.test.ts` (51.5),
  `src/features/auth/components/__tests__/ProtectedRoute.devBypass.test.tsx` (51.4/51.6/
  51.7/51.8) — 35 testes, RED 7 → GREEN 35.

## Achados resolvidos por esta decisão

- findings-02.md A16 (bypass `dev` sem whitelist de ambiente) — PARCIAL → coberto no frontend.
- findings-02.md A17 (safety net 10s sem guard anti-loop) — PARCIAL → resolvido.
