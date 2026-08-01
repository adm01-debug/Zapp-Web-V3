# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

**Total de achados até agora: 39** (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3).

---

## Tema 1 — Higienização do repositório

### F1-01 — Deletar `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`
- **Ação:** `git rm ___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`.
- **Aceite:** arquivo ausente em `main`.

### F1-02 — Ignorar e remover `__pycache__/`
- **Ação:** adicionar `__pycache__/` e `*.pyc` ao `.gitignore`; `git rm -r --cached __pycache__`.

### F1-03 — Mover scripts soltos para `scripts/`
- **Evidência:** `ci_cost_analysis.py`, `gen_insert.cjs` na raiz.
- **Ação:** `mv` para `scripts/`. Atualizar `package.json`.

### F1-04 — Migrar `lgpd_deploy.sql` para `supabase/migrations/`
- **Ação:** renomear com timestamp; registrar em `supabase_migrations.schema_migrations`.

### F1-05 — Mover 8 relatórios `.md` da raiz para `docs/audits/history/`

### F1-06 — Deletar duplicata `playwright.e2e.config.fixed.ts`

### F1-07 — Consolidar 5 pastas de teste em `src/**/__tests__/` + `e2e/`

### F1-08 — Deletar `supabase/functions-legacy/` (grep imports antes)

### F1-09 — Mover/deletar `supabase/fatorx-migrations/` (projeto errado)

---

## Tema 2 — Gates de CI e qualidade

### F1-10 — Remover `|| true` do script `lint` em `package.json`

### F1-11 — Reduzir `--max-warnings 999 → 0` progressivamente

---

## Tema 3 — Segurança Supabase

### F2-01 — Revogar `EXECUTE` de `authenticated` nas 6 TRIGGER functions em `public`
- `fn_contacts_proxy_delete/insert/update`, `fn_messages_bridge_delete/insert/update`.

### F2-02 — Revogar `EXECUTE` de `authenticated` nas 3 outras TRIGGER functions em `public`
- `handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket`.

### F2-03 — Revisar 9 RPCs SECDEF em `public` — garantir `auth.uid()` + tenant check
- `rpc_get_contact` (2 overloads), `rpc_app_bootstrap`, `rpc_dashboard_init`, `generate_transfer_ticket`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `increment_webhook_rate_limit`, `is_instance_paused`, `log_rls_denied`.

### F2-04 — Auditoria CSV das 119 SECDEF+authenticated em `zapp` (`docs/audits/secdef-zapp.csv`)

### F2-05 — Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5)

---

## Tema 4 — Performance de banco

### F2-09 — Mover `ops.fn_regression_tests()` para off-peak + MV cached (8,8 s/call → 0)

### F2-10 — Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios` para batch

### F2-11 — Investigar `zapp.fn_system_health_score_cached` (289 ms apesar do nome "_cached")

### F2-12 — Reduzir invalidações do PostgREST schema cache (203 s totais em introspection)

### F2-13 — Índice parcial em `zapp.messages` para badge unread inbound
```sql
CREATE INDEX CONCURRENTLY idx_msg_unread_inbound
  ON zapp.messages (direction, is_read)
  WHERE is_read = false AND direction = 'inbound';
```

---

## Tema 5 — Consolidação de cron jobs

### F2-06 — Consolidar 4 pares de duplicatas de cron
- `cleanup_expired_contact_ids` (190) + `evo_cleanup_expired_contact_ids` (189).
- `purge-processed-webhook-events` (54) + `purge_webhook_events_processed` (152).
- `purge-webhook-audit-log-90d` (209) + `purge_webhook_audit` (61).
- `cleanup-cron-job-history` (99) + `cleanup-cron-job-logs` (216).

### F2-07 — Escalonar 6 VACUUMs diários (02:06–02:21) em janelas > 5 min

### F2-08 — Reagrupar chain logflare (7 jobs, 03:00–03:45) em job único

---

## Tema 6 — Frontend: router, navegação, arquitetura

### F1-12 — Homônimos em `src/pages/` — padronizar `<slug>/index.tsx`

### F1-13 — 11 pages órfãs (sem `<Route>`) mas lazy-carregadas — decidir URL ou `?view=`

### F1-14 — Consolidar padrão duplo URL canônica vs `?view=X&tab=Y`

---

## Tema 7 — Frontend: auth e sessão

### F3-01 — CRÍTICO (P0): `supabase.auth.getSession()` fora de `useEffect` em `ProtectedRoute.tsx`

- **Origem:** Etapa 22 (Bloco 3).
- **Evidência:** `src/features/auth/components/ProtectedRoute.tsx` linhas 260-269:
  ```typescript
  if (!authLoading && user) {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        supabase.auth.signOut().then(() => {
          window.location.replace('/auth');
        });
      }
    });
  }
  ```
  Executa em cada render (2× em StrictMode). Se `getSession()` retornar null transitoriamente, dispara logout automático.
- **Ação:** mover para `useEffect(() => { ... }, [authLoading, user])` com `AbortController` para cancelar em unmount, e adicionar debounce/guard para não redispatchar `signOut` se já em progresso.
- **Aceite:** teste manual com Chrome DevTools "Network throttling: Slow 3G" — user autenticado não deve ser deslogado por race entre `getSession` calls; nenhum `supabase.auth.signOut()` inesperado dispara em logs.

### F3-02 — `isDev` bypass total sem log de auditoria

- **Origem:** Etapa 28 (Bloco 3).
- **Evidência:** `ProtectedRoute.tsx` linhas 304-307. Se role `dev` for concedida em produção por engano, ninguém sabe que rotas o user acessou.
- **Ação:** adicionar `void supabase.rpc('log_security_event', { p_event_type: 'dev_bypass_used', p_resource: location.pathname, ... });` antes do return, com throttle (só logar 1× por session+path).
- **Aceite:** tabela `zapp.security_events` (ou `ops.security_events`) recebe eventos `dev_bypass_used` quando role `dev` acessa rota que exigiria outro role.

### F3-03 — `verifyHttpOnlyCookieAuth()` é dead code — remover

- **Origem:** Etapa 23.
- **Evidência:** `cookieStorage.ts` linha ~92: `export function verifyHttpOnlyCookieAuth(): boolean { return true; }` marcada `@deprecated`. `AuthProvider.tsx` linha 416 loga `[Auth] Security check failed` quando retorna false — condição impossível.
- **Ação:** (a) remover a função do `cookieStorage.ts`; (b) remover import + chamada em `AuthProvider.tsx`; (c) grep global por outros call sites.
- **Aceite:** função inexistente; `bun run build` sucede.

### F3-04 — `refreshAll` sem `AbortController` — race em `TOKEN_REFRESHED` consecutivo

- **Origem:** Etapa 24.
- **Evidência:** `AuthProvider.tsx` `refreshAll = useCallback(async (userId, options) => { Promise.all([fetchProfile(userId), fetchRolesAndPermissions(userId)]); ... })`. Se `onAuthStateChange` emite `TOKEN_REFRESHED` + `USER_UPDATED` em <1 s, duas passadas concorrentes rodam sem cancelamento.
- **Ação:** passar `AbortSignal` para `fetchProfile` e `fetchRolesAndPermissions`; manter `AbortController` em `useRef` que é abortado no início de cada nova chamada.
- **Aceite:** rodar teste com dois `authService.onAuthStateChange` triggers em rápida sucessão — apenas uma passada resolve, a anterior é cancelada.

### F3-05 — Parsing frágil de `role_permissions` — pode retornar `permissions = []` silenciosamente

- **Origem:** Etapa 25.
- **Evidência:** `AuthProvider.tsx` linha 130-140:
  ```typescript
  const perm = Array.isArray(p.permissions) ? p.permissions[0] : p.permissions;
  return (perm as { name?: string } | null)?.name;
  ```
- **Ação:** (a) logar warning estruturado quando `userPermissions.length > 0` mas `permNames.length === 0` (indica parse quebrado); (b) emitir toast pro user "Erro ao carregar permissões" quando isso ocorre.
- **Aceite:** log de warning presente quando parse retorna vazio; teste unitário cobre ambos shapes (array + objeto).

### F3-06 — Realtime `zapp.profiles` só captura UPDATE

- **Origem:** Etapa 26.
- **Evidência:** `AuthProvider.tsx` linha ~500:
  ```typescript
  .on('postgres_changes', { event: 'UPDATE', schema: 'zapp', table: 'profiles', ... })
  ```
  Para `user_roles` já usa `event: '*'`.
- **Ação:** trocar `event: 'UPDATE'` para `event: '*'` na subscription de `profiles`.
- **Aceite:** teste manual — deletar profile via SQL → front deve receber notification (embora provavelmente nunca aconteça, é consistência).

### F3-07 — `retryBootstrap()` pode empilhar `getSession()` sob `navigator.locks`

- **Origem:** Etapa 27.
- **Evidência:** `AuthProvider.tsx` `retryBootstrap` verifica `isRetryingRef.current` mas o `withTimeout(supabase.auth.getSession(), 8000, ...)` do `runBootstrap` original continua pendurado.
- **Ação:** propagar `AbortSignal` no `withTimeout` OU usar `AbortController` que é abortado antes de novo bootstrap iniciar. Alternativa: usar `bootstrapRunRef` como fonte de verdade e descartar respostas se `runId !== bootstrapRunRef.current` (já faz, mas o lock ainda fica contido).
- **Aceite:** logs mostram apenas 1 `getSession` ativo por vez sob `navigator.locks`.

### F3-08 — Deletar `externalSessionBridge.ts` — dead code ativo

- **Origem:** Etapa 29.
- **Evidência:** `externalSessionBridge.ts` (8 099 B / 140 linhas) é no-op desde 2026-07-15 (`externalSupabase === supabase`). 3 guards `if ((externalSupabase as unknown) === (supabase as unknown)) return () => {}` em `registerExternalSessionBridge`, `mirrorExternalSignIn`, `mirrorExternalSignOut`.
- **Ação:** (a) deletar `externalSessionBridge.ts` e `externalClient.ts`; (b) remover import + `registerExternalSessionBridge()` em `main.tsx`; (c) buscar e remover call sites de `mirrorExternalSignIn` / `mirrorExternalSignOut` (deve haver em auth flows).
- **Aceite:** repo sem referências a `externalSessionBridge`; `bun run build` sucede; nenhum re-teste de auth quebrado.

### F3-09 — `signOut` sem fallback local se supabase-js falhar

- **Origem:** Etapa 30.
- **Evidência:** `AuthProvider.tsx` `signOut` chama `authService.signOut()` — se falhar (network, storage), state React limpa mas `localStorage['sb-*-auth-token']` permanece.
- **Ação:** try/catch com cleanup manual `Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))` no catch/finally.
- **Aceite:** teste manual: simular network offline, chamar signOut, confirmar que localStorage sb-* foi limpo mesmo assim.

### F3-10 — `QuotaExceededError` silenciado em cookieStorage — user perde sessão sem aviso

- **Origem:** Etapa 30.
- **Evidência:** `cookieStorage.ts` linha ~55: `try { localStorage.setItem(...); } catch { /* ignora */ }`. Se localStorage cheio, próximo reload perde sessão.
- **Ação:** emitir `window.dispatchEvent(new CustomEvent('zapp:storage-quota-exceeded', { detail: { key } }))` no catch. Um listener global em `AppProviders` ou `AppContent` mostra toast/dialog pro user.
- **Aceite:** ao encher localStorage propositalmente e forçar signIn, toast "Espaço de armazenamento cheio — sua sessão pode ser perdida ao recarregar" aparece.

### F3-11 — `markTimeToMainScreen` triplicado no ProtectedRoute

- **Origem:** Etapa 30.
- **Evidência:** chamado em 3 lugares (linhas ~306, ~314, ~365).
- **Ação:** guard com `useRef<Set<string>>` de paths já marcados nesta sessão de componente — só marca a primeira vez.
- **Aceite:** métrica `time_to_main_screen` tem 1 sample por path por session, não 3.

### F3-12 — `log_security_event` sem contexto suficiente

- **Origem:** Etapa 30.
- **Evidência:** `ProtectedRoute.tsx` linhas 340, 375: envia `p_event_type`, `p_resource`, `p_action`, `p_status`, `p_details`. Sem `tenant_id`, `user_agent`, `ip_hash`, `session_id`.
- **Ação:** enriquecer com contexto — `p_user_agent: navigator.userAgent`, `p_tenant_id: <extract from JWT>`, `p_session_id: session.access_token.slice(-16)` (hash do fim do token para correlação).
- **Aceite:** `zapp.security_events` tem colunas populated; queries de forensics por tenant/session viáveis.

---

## Tema 8 — Frontend: inbox e mensageria

_(aguardando Bloco 4 — próximo chat)_

## Tema 9 — Frontend: admin e observabilidade

_(aguardando Bloco 7 — próximo chat)_

## Tema 10 — Infra, deploy e resiliência

_(aguardando Bloco 9 — próximo chat)_
