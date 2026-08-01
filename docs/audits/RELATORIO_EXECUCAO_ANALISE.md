# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 (F1-01 a F1-14) |
| 2 | Auditoria do banco (11-20) | ✅ Concluído | 13 (F2-01 a F2-13) |
| 3 | Autenticação e sessão (21-30) | ✅ Concluído | 12 (F3-01 a F3-12) |
| 4 | Inbox e mensageria (31-45) | ⏸ Pendente | — |
| 5 | Contatos e CRM (46-55) | ⏸ Pendente | — |
| 6 | Conexões WhatsApp (56-65) | ⏸ Pendente | — |
| 7 | Admin e monitoramento (66-75) | ⏸ Pendente | — |
| 8 | SLA/BPM (76-80) | ⏸ Pendente | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

**Achados até aqui: 39 (14 do Bloco 1 + 13 do Bloco 2 + 12 do Bloco 3).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

_(Detalhes registrados anteriormente.)_

## Bloco 2 — Auditoria do banco (etapas 11-20)

_(Detalhes registrados anteriormente.)_

---

## Bloco 3 — Autenticação e sessão (etapas 21-30)

Arquivos auditados linha a linha:
- `src/features/auth/components/AuthProvider.tsx` (21 369 B) — coração da autenticação.
- `src/features/auth/components/ProtectedRoute.tsx` (12 192 B) — route guard RBAC.
- `src/integrations/supabase/cookieStorage.ts` (3 078 B) — storage adapter.
- `src/integrations/supabase/externalSessionBridge.ts` (8 099 B) — bridge dual-session FATOR X.

### Etapa 21 — Arquitetura de auth (visão geral)

- `AuthProvider` faz **hidratação otimista** lendo `sb-<ref>-auth-token` do `localStorage` sem chamada de rede, renderizando na hora e revalidando em background com `getSession()` sob `withTimeout(8000)`.
- Fallback robusto para valor `base64-`, chunks (`.0/.1/.N`), shape legado v1 (`{ currentSession }`), e `expires_at` malformado (rejeita `null`, `NaN`, `Infinity`, `≤0`).
- **Safety-net timeout de 10 s** cancela loading preso; `onAuthStateChange` do supabase-js é fonte de verdade (emite `TOKEN_REFRESHED`, `SIGNED_OUT`).
- **Auto-reconnect** via listener `'online'` disparando `retryBootstrap()`.
- Realtime CDC em `zapp.profiles` (UPDATE only) e `zapp.user_roles` (`event: '*'`).

### Etapa 22 — Bug crítico no `ProtectedRoute`

Linhas 260-269 de `ProtectedRoute.tsx`:

```typescript
if (!authLoading && user) {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) {
      log.warn('[ProtectedRoute] Stale session detected — forcing redirect to /auth');
      supabase.auth.signOut().then(() => {
        window.location.replace('/auth');
      });
    }
  });
}
```

Este bloco executa **dentro do body do componente**, fora de qualquer `useEffect`. React 18 vai chamar isto em cada render (2× no StrictMode). Se `getSession()` retorna null (que pode acontecer transitoriamente em race conditions), o app dispara `signOut()` + `window.location.replace('/auth')` de imediato. É um trigger de logout automático não intencional.

**Achado F3-01 — CRÍTICO (P0).**

### Etapa 23 — `verifyHttpOnlyCookieAuth()` é no-op

`cookieStorage.ts` exporta `verifyHttpOnlyCookieAuth(): boolean { return true; }` marcada como `@deprecated`. `AuthProvider.tsx` linha 416 ainda a chama e loga `[Auth] Security check failed: httpOnly cookies not properly configured` se retornar `false` — que **nunca acontece**. O security check é fake.

**Achado F3-03.**

### Etapa 24 — `refreshAll` sem `AbortController`

`Promise.all([fetchProfile(userId), fetchRolesAndPermissions(userId)])` em `AuthProvider.tsx`. Se `onAuthStateChange` dispara `TOKEN_REFRESHED` em rápida sucessão (ex: refresh silencioso + USER_UPDATED), duas chamadas concorrentes rodam sem cancelamento. Setstate fora de ordem possível.

**Achado F3-04.**

### Etapa 25 — Parsing frágil de `role_permissions`

```typescript
.select('permission_id, permissions!inner(name)')
// depois:
const perm = Array.isArray(p.permissions) ? p.permissions[0] : p.permissions;
return (perm as { name?: string } | null)?.name;
```

Se PostgREST muda de comportamento (versão SDK, hint `!inner` diferente), o parsing pode falhar sem log de erro visível. Falha silenciosa → user com `permissions = []` → 403 em todas as rotas.

**Achado F3-05.**

### Etapa 26 — Realtime `zapp.profiles` só captura UPDATE

```typescript
.on('postgres_changes', { event: 'UPDATE', schema: 'zapp', table: 'profiles', ...})
```

INSERT (novo user) e DELETE (banido/removido) não emitem eventos ao front. Para `user_roles` o filtro é `event: '*'` (correto).

**Achado F3-06.**

### Etapa 27 — `retryBootstrap()` re-arma timeout mas não cancela `getSession()` anterior

`retryBootstrap` verifica `isRetryingRef` para idempotência mas o `withTimeout(supabase.auth.getSession(), 8000, 'getSession')` do `runBootstrap` anterior ainda está vivo sob o `navigator.locks`. Retries em série podem enfileirar 2-3 promises competindo pelo mesmo lock.

**Achado F3-07.**

### Etapa 28 — `isDev` = bypass total sem log

`ProtectedRoute.tsx` linhas 304-307: `if (isDev) { markTimeToMainScreen(location.pathname); return <>{children}</>; }` — usuários com role `dev` bypassam **todos** os checks de role e permission. Sem log, sem `log_security_event('dev_bypass', ...)`. Se `dev` for concedido em produção por engano, ninguém sabe.

**Achado F3-02.**

### Etapa 29 — `externalSessionBridge` é dead code ativo

O bridge inteiro (140 linhas de lógica) tem guard `if ((externalSupabase as unknown) === (supabase as unknown)) return () => {...};` em três pontos e roda como **no-op desde 2026-07-15** conforme documentado. `main.tsx` importa e chama `registerExternalSessionBridge()`. Módulo carregado em cada boot só para retornar cleanup vazio.

**Achado F3-08.**

### Etapa 30 — Outras fragilidades registradas

- `signOut` sem fallback local se supabase-js falhar (F3-09).
- `QuotaExceededError` silenciado em `cookieStorage.setItem` — user perde sessão sem aviso (F3-10).
- `markTimeToMainScreen` chamado em 3 lugares do `ProtectedRoute` — pode multiplicar métricas (F3-11).
- `log_security_event` sem `tenant_id`/IP/user agent — logs de baixa fidelidade para forensics (F3-12).

---

## Achados do Bloco 3 (12 itens registrados em `PLANO_IMPLEMENTACAO_100.md`)

- **F3-01** — CRÍTICO: `supabase.auth.getSession()` chamado fora de `useEffect` em `ProtectedRoute.tsx` linhas 260-269. Move para dentro de `useEffect` com dependências `[authLoading, user]` e `AbortController`.
- **F3-02** — `isDev` bypass sem log de auditoria em `ProtectedRoute`. Adicionar `log_security_event('dev_bypass_used', ...)` para rastreabilidade.
- **F3-03** — `verifyHttpOnlyCookieAuth()` é dead code (`return true` fixo). Remover função + chamada em AuthProvider.
- **F3-04** — `refreshAll` sem cancelamento em race conditions. Adicionar `AbortController` propagado a `fetchProfile` e `fetchRolesAndPermissions`.
- **F3-05** — Parsing de `role_permissions` frágil. Adicionar log estruturado quando o parse retornar `[]` inesperadamente + toast pro user.
- **F3-06** — Realtime `zapp.profiles` só escuta UPDATE. Trocar para `event: '*'` como `user_roles`.
- **F3-07** — `retryBootstrap()` pode empilhar `getSession()` sob `navigator.locks`. Adicionar `AbortController` ou skip se `bootstrapRunRef` bumped.
- **F3-08** — Deletar `externalSessionBridge.ts` + remover import em `main.tsx`. Bridge é no-op desde 2026-07-15.
- **F3-09** — `signOut` sem fallback local. Adicionar try/catch com cleanup manual de `localStorage['sb-*']` se supabase-js falhar.
- **F3-10** — `QuotaExceededError` silencioso em cookieStorage. Emitir CustomEvent `zapp:storage-quota-exceeded` para UI mostrar aviso.
- **F3-11** — `markTimeToMainScreen` triplicado em ProtectedRoute. Guard com `useRef` de "already-marked-for-this-path".
- **F3-12** — `log_security_event` sem contexto suficiente. Adicionar `tenant_id`, `user_agent`, `ip_hash`, `session_id`.

---

## Retomada — próximo chat

Onde parar de Bloco 3 e o que executar em seguida:

1. **Bloco 4 — Inbox e mensageria (etapas 31-45):**
   - `src/features/inbox/*` — `RealtimeInboxView`, hooks de realtime, message queue, retry.
   - `src/features/inbox/hooks/*` — busca, filtros, tab counters.
   - `src/pages/inbox/InboxPage.tsx` + `src/pages/inbox/AgentsOperationsPage.tsx`.
   - `src/pages/ChatPopup.tsx`.
   - Fluxos: envio texto/áudio/mídia, marca lida, transferência, encerramento, encaminhamento.
   - Auditoria de subscription realtime: quantos channels ativos, quotas, cleanup on unmount.

2. **Bloco 5-10:** roteiro completo em `PLANO_QA_ANALISE_100.md`.

**Documentos ao final desta sessão (3 blocos concluídos):**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 39 achados nos Temas 1-7.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.
