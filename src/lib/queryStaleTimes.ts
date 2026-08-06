/**
 * Centralized TTL configuration for quasi-static global data (ZAPP).
 *
 * Motivação: dados de catálogo/config (queues, permissions, app_settings,
 * global_settings, quick_replies, inbox_custom_scopes, contact_tags,
 * email_accounts, perfis) mudam raramente — só via admin. Sem staleTime,
 * o React Query re-busca a cada mount/foco, gerando o padrão observado em
 * produção de dezenas de queries repetidas a cada 1-2min.
 *
 * Regras de uso:
 *  - `QUERY_STALE_TIMES.<domínio>` → staleTime do useQuery do domínio.
 *  - `QUERY_GC_TIMES.<domínio>`    → gcTime (≥ 2x staleTime; mantém o dado
 *    em cache após unmount, evitando refetch em navegação de volta).
 *  - Para hooks manuais (sem React Query), use `MODULE_TTL_MS` no mesmo
 *    espírito: cache module-level com timestamp, invalidado por mutações.
 */

/** staleTime por domínio (ms). */
export const QUERY_STALE_TIMES = {
  /** Catálogo quase-estático: muda apenas via admin/settings. */
  queues: 5 * 60_000,
  queueMembers: 5 * 60_000,
  profiles: 5 * 60_000,
  permissions: 5 * 60_000,
  appSettings: 5 * 60_000,
  globalSettings: 5 * 60_000,
  quickReplies: 5 * 60_000,
  inboxCustomScopes: 5 * 60_000,
  contactTags: 5 * 60_000,
  emailAccounts: 5 * 60_000,
  /** Quase-estático por usuário: prefereências/filtros (1-2min). */
  savedFilters: 2 * 60_000,
  userSettings: 2 * 60_000,
  slaAlertPreferences: 2 * 60_000,
  slaConfigurations: 2 * 60_000,
  slaRules: 2 * 60_000,
} as const;

/** gcTime por domínio (ms) — sempre ≥ 2x o staleTime do mesmo domínio. */
export const QUERY_GC_TIMES = {
  queues: 10 * 60_000,
  queueMembers: 10 * 60_000,
  profiles: 10 * 60_000,
  permissions: 10 * 60_000,
  appSettings: 10 * 60_000,
  globalSettings: 10 * 60_000,
  quickReplies: 10 * 60_000,
  inboxCustomScopes: 10 * 60_000,
  contactTags: 10 * 60_000,
  emailAccounts: 10 * 60_000,
  savedFilters: 5 * 60_000,
  userSettings: 5 * 60_000,
  slaAlertPreferences: 5 * 60_000,
  slaConfigurations: 5 * 60_000,
  slaRules: 5 * 60_000,
} as const;

/** TTL de caches module-level (hooks manuais sem React Query). */
export const MODULE_TTL_MS = {
  catalog: 5 * 60_000,
  userPrefs: 2 * 60_000,
} as const;
