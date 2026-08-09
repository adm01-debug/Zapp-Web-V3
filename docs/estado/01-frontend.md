# 01 — Frontend: Shell da Aplicação e Roteamento

> Auditado em 2026-08-09 a partir dos arquivos fonte em `src/`.
> Nomes, caminhos e roles extraídos sem invenção.

---

## 1. Shell da Aplicação

### `src/main.tsx`

Ponto de entrada montado por Vite. Responsabilidades:

- Chama `registerExternalSessionBridge()` — instala bridge dual-session para o banco Evolution DB (schema `evo`).
- Chama `initializeSilentErrorPrevention()`.
- Chama `initSentry()` — inicializa SDK Sentry (no-op se `VITE_SENTRY_DSN` não configurado).
- Chama `initWebVitals()` — registra métricas Core Web Vitals.
- Importa `./i18n` para inicializar o módulo de internacionalização.
- Registra os únicos handlers globais de `unhandledrejection` e `error` da aplicação — filtram ruídos benignos via `isBenignConsoleNoise()` e encaminham erros reais para `logStructuredError()`.
- Em modo DEV: carrega `@axe-core/react` dinamicamente para auditoria de acessibilidade (sem impacto em produção).
- Renderiza `<App />` embrulhado em `<SentryErrorBoundary>` (fallback inline com botão "Tentar novamente" e, em DEV, stack trace exposto).

Não declara nenhum provider próprio — providers ficam em `AppProviders`.

---

### `src/components/providers/AppProviders.tsx`

Componente `AppProviders` que envolve toda a árvore de features com a pilha de contextos globais.

**Providers declarados (ordem de fora para dentro):**

| # | Provider | Origem | Observações |
|---|----------|--------|-------------|
| 1 | `ErrorBoundary` | `@/components/errors/ErrorBoundary` | Props: `resetKey={errorKey}`, `onError`, `onReset` |
| 2 | `QueryClientProvider` | `@tanstack/react-query` | `queryClient` criado com `useMemo`; `staleTime=10min`, `gcTime=60min`, retry via `tanstackRetry` |
| 3 | `ValidationProvider` | `@/components/providers/ValidationProvider` | — |
| 4 | `AuthProvider` | `@/features/auth` | — |
| 5 | `ThemeSync` | `@/hooks/useTheme` | Componente sem filhos; sincroniza tema |
| 6 | `HighContrastProvider` | `@/components/theme/HighContrastToggle` | — |
| 7 | `TooltipProvider` | `@/components/ui/tooltip` | `delayDuration={100}`, `skipDelayDuration={50}` |

**Lógica de recuperação de erros (`onError` do ErrorBoundary):**

1. **Chunk-load error** — chama `triggerChunkReload()`.
   - Se retornar `true`: reload iniciado, sem ação adicional.
   - Se retornar `false` (budget esgotado): seta `staleBundle=true` → renderiza `<StaleBundleNotice />` (tela independente de todo context, com botão "Atualizar agora" que chama `resetChunkReloadGuard()` + `window.location.reload()`).
2. **Outros erros** — auto-retry com back-off exponencial: espera `2000ms × tentativa`, máximo `MAX_RETRIES=3`. Após 3 falhas, loga "Manual intervention required".

**Feature flags:** `loadFeatureFlags()` é chamado no mount e nos eventos `SIGNED_IN` / `SIGNED_OUT` do `supabase.auth.onAuthStateChange`.

---

### `src/lib/lazyWithRetry.ts`

Módulo responsável por todo o mecanismo de lazy-loading com recuperação automática.

**Função principal `lazyWithRetry(factory, maxAttempts=3)`:**

Wrapper sobre `React.lazy()`. Para cada import dinâmico que falha:
- Se for **chunk-load error** (detectado por `isChunkLoadError`): chama `triggerChunkReload()` imediatamente e relança o erro (sem contar como tentativa de retry).
- Se for **outro erro de rede**: re-tenta até `maxAttempts` vezes com back-off de `1000ms × tentativa`.

**`isChunkLoadError(err)`:**

Detecta falha de chunk por correspondência de mensagem (case-insensitive):
- `"failed to fetch dynamically imported module"`
- `"loading chunk"`
- `"importing a module script failed"`
- `"error loading dynamically imported module"`
- `"unable to preload css for"`

**`triggerChunkReload()`:**

Aplica dois guards em `sessionStorage` antes de chamar `window.location.reload()`:

| Guard | Chave sessionStorage | Valor |
|-------|---------------------|-------|
| Budget (contagem) | `__zapp_chunk_reload_count` | Máx. **2** reloads por sessão (`MAX_CHUNK_RELOADS=2`) |
| Cooldown (tempo) | `__zapp_chunk_reload_at` | Mínimo **30 s** entre reloads (`CHUNK_RELOAD_COOLDOWN_MS=30_000`) |

Retorna `true` quando reload foi iniciado; `false` quando budget esgotado (callers devem tratar o `false` exibindo prompt ao usuário). Tolerância de clock skew: `CLOCK_SKEW_TOLERANCE_MS=60_000ms`.

**Utilitários exportados:** `isChunkLoadError`, `triggerChunkReload`, `hasExhaustedChunkReloads`, `resetChunkReloadGuard`, `CHUNK_RELOAD_SESSION_KEY`, `CHUNK_RELOAD_COUNT_SESSION_KEY`, `MAX_CHUNK_RELOADS`, `CLOCK_SKEW_TOLERANCE_MS`.

---

### `src/components/errors/ErrorBoundary.tsx`

Classe `ErrorBoundary extends Component<Props, State>` (React class component obrigatório para `componentDidCatch`).

**Props:**

| Prop | Tipo | Descrição |
|------|------|-----------|
| `children` | `ReactNode` | Conteúdo protegido |
| `fallback?` | `ReactNode` | UI alternativa (sobrescreve a UI padrão) |
| `onError?` | `(error, errorInfo) => void` | Callback chamado em `componentDidCatch` |
| `onReset?` | `() => void` | Chamado quando boundary transita de erro para OK |
| `resetKey?` | `string \| number` | Mudança de valor limpa o estado de erro via `getDerivedStateFromProps` |

**Ciclo de vida relevante:**

- `getDerivedStateFromError`: seta `hasError=true`; detecta `isStackOverflow` (Maximum call stack size exceeded).
- `getDerivedStateFromProps`: ao detectar mudança em `resetKey`, limpa estado de erro — mecanismo de reset externo sem re-mount.
- `componentDidCatch`: chama `detectAndReloadOnChunkError` (thin wrapper sobre `isChunkLoadError` + `triggerChunkReload`); emite evento de telemetria via `recordQueryEvent`; chama `props.onError`.
- `componentDidUpdate`: chama `props.onReset` na transição `prevState.hasError=true → this.state.hasError=false`.

**UI de fallback contextual (quando `fallback` não fornecido):**

| Cenário | Título | Ação primária |
|---------|--------|---------------|
| Chunk-load error | "Atualização disponível" | Botão "Recarregar Página" (`window.location.reload()`) |
| Stack overflow | "Erro de recursão infinita" | Botão "Recarregar e Recuperar" (`window.location.reload()`) |
| Erro genérico | "Ops! Algo deu errado" | Botão "Tentar novamente" (re-render via `setState`) + link de reload completo |

Em modo `development`: exibe `<details>` com `error.message` e `componentStack`.

**Exports adicionais:** `withErrorBoundary<P>` (HOC), `ErrorFallback` (componente inline pequeno para uso em componentes individuais).

---

### `src/components/routing/AppRoutes.tsx`

Componente `AppRoutes` — raiz da árvore de rotas.

**Estrutura:**
```
<Suspense fallback={<RouteLoadingFallback />}>
  <PageTransition>
    <Routes>
      ...rotas inline...
      {debugRoutes()}
      {adminRoutes()}
    </Routes>
  </PageTransition>
</Suspense>
```

- `RouteLoadingFallback`: spinner com ícone `Sparkles` animado em `animate-pulse`, ocupa `h-screen`, acessível com `role="status"` e `aria-label="Carregando"`.
- `PageTransition`: envolve todas as rotas com animação de transição entre páginas.
- `debugRoutes()` e `adminRoutes()`: funções que retornam fragments React (não são componentes — não podem ser usados como `<AdminRoutes />`).
- Quase todas as páginas são carregadas via `lazyWithRetry`; exceção: `NotFound` (importação direta estática).

---

## 2. Tabela Mestra de Rotas

Extraída de `AppRoutes.tsx`, `AdminRoutes.tsx` e `DebugRoutes.tsx`.

### 2.1 Rotas de AppRoutes.tsx

| Path | Componente | Arquivo | Lazy? | Guard / Role | Layout pai |
|------|-----------|---------|-------|-------------|-----------|
| `/` | `Index` | `@/pages/Index` | Sim | `ProtectedRoute` | `PageTransition` |
| `/inbox` | `InboxPage` | `@/pages/inbox/InboxPage` | Sim | `ProtectedRoute` | `PageTransition` |
| `/queue/:id` | `QueueDetails` | `@/pages/QueueDetails` | Sim | `ProtectedRoute` | `PageTransition` |
| `/queues/comparison` | `QueuesComparison` | `@/pages/QueuesComparison` | Sim | `ProtectedRoute` | `PageTransition` |
| `/sla` | `SLADashboard` | `@/pages/SLADashboard` | Sim | `ProtectedRoute` | `PageTransition` |
| `/sla/history` | `SLAHistory` | `@/pages/SLAHistory` | Sim | `ProtectedRoute` | `PageTransition` |
| `/sla/preferences` | `SLAAlertPreferences` | `@/pages/SLAAlertPreferences` | Sim | `ProtectedRoute` | `PageTransition` |
| `/sla/alerts` | `SLAAlertHistory` | `@/pages/SLAAlertHistory` | Sim | `ProtectedRoute` | `PageTransition` |
| `/chat-popup/:contactId` | `ChatPopup` | `@/pages/ChatPopup` | Sim | `ProtectedRoute` | `PageTransition` |
| `/design-system` | `DesignSystem` | `@/pages/DesignSystem` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/install` | `Install` | `@/pages/Install` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/auth` | `Auth` | `@/pages/Auth` | Sim | Nenhum | `PageTransition` |
| `/.lovable/oauth/consent` | `OAuthConsent` | `@/pages/OAuthConsent` | Sim | Nenhum | `PageTransition` |
| `/forgot-password` | `ForgotPassword` | `@/pages/ForgotPassword` | Sim | Nenhum | `PageTransition` |
| `/reset-password` | `ResetPassword` | `@/pages/ResetPassword` | Sim | Nenhum | `PageTransition` |
| `/verify-email` | `VerifyEmail` | `@/pages/VerifyEmail` | Sim | Nenhum | `PageTransition` |
| `/auth/callback` | `SSOCallback` | `@/pages/SSOCallback` | Sim | Nenhum | `PageTransition` |
| `/2fa` | `TwoFactorAuth` | `@/pages/TwoFactorAuth` | Sim | Nenhum | `PageTransition` |
| `/access-denied` | `AccessDenied` | `@/pages/AccessDenied` | Sim | Nenhum | `PageTransition` |
| `/login` | _(redirect → `/auth`)_ | — | — | Nenhum | — |
| `/chat-popup` | _(redirect → `/`)_ | — | — | Nenhum | — |
| `/connections` | _(redirect → `/?view=connections&tab=connections`)_ | — | — | Nenhum | — |
| `/integrations` | _(redirect → `/?view=connections&tab=integrations`)_ | — | — | Nenhum | — |
| `*` | `NotFound` | `@/pages/NotFound` | **Não** | Nenhum | `PageTransition` |

### 2.2 Rotas de DebugRoutes.tsx

| Path | Componente | Arquivo | Lazy? | Guard / Role | Layout pai |
|------|-----------|---------|-------|-------------|-----------|
| `/debug/send-status-bus` | `SendStatusBusDebug` | `@/pages/SendStatusBusDebug` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/debug/realtime-fanout` | `RealtimeFanoutDebug` | `@/pages/RealtimeFanoutDebug` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/debug/backend` | `BackendDiagnostics` | `@/pages/BackendDiagnostics` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |

### 2.3 Rotas de AdminRoutes.tsx

| Path | Componente | Arquivo | Lazy? | Guard / Role | Layout pai |
|------|-----------|---------|-------|-------------|-----------|
| `/admin/roles` | `RolesPage` | `@/pages/admin/RolesPage` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/departments` | `DepartmentsPage` | `@/pages/admin/DepartmentsPage` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/rate-limit` | `RateLimitDashboard` | `@/pages/admin/RateLimitDashboard` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/hmac-selftest` | `HmacSelfTestPage` | `@/pages/admin/HmacSelfTestPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/operations` | `AdminOperationsPage` | `@/pages/admin/AdminOperationsPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/channels` | `AdminChannelsPage` | `@/pages/admin/AdminChannelsPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/queues` | `AdminQueuesPage` | `@/pages/admin/AdminQueuesPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/providers` | `AdminProvidersPage` | `@/pages/admin/AdminProvidersPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/failed-auth-messages` | `AdminFailedAuthMessagesPage` | `@/pages/admin/AdminFailedAuthMessagesPage` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/route-permissions` | `RoutePermissionsPage` | `@/pages/admin/RoutePermissionsPage` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/inbox-sync-status` | `AdminInboxSyncStatusPage` | `@/pages/admin/AdminInboxSyncStatusPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/self-hosted-health` | `SelfHostedHealthPage` | `@/pages/admin/SelfHostedHealthPage` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/admin/evo-api-health` | `AdminEvoApiHealthPage` | `@/pages/admin/AdminEvoApiHealthPage` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/admin/bridge-status` | `AdminBridgeStatusPage` | `@/pages/admin/AdminBridgeStatusPage` | Sim | `ProtectedRoute` — admin, dev, supervisor | `PageTransition` |
| `/admin/connections` | `AdminConnectionsPage` | `@/pages/admin/Connections` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/security-logs` | `AdminSecurityLogsPage` | `@/pages/admin/AdminSecurityLogsPage` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/admin/acl-alerts` | `AdminACLAlertsPage` | `@/pages/admin/AdminACLAlertsPage` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/admin/zappweb-demo` | `ZappWebbDemoPage` | `@/pages/admin/ZappWebbDemoPage` | Sim | `ProtectedRoute` — admin, dev, manager | `PageTransition` |
| `/admin/automations` | `AdminAutomationsPage` | `@/pages/admin/AdminAutomationsPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/automations/logs` | `AdminAutomationLogsPage` | `@/pages/admin/AdminAutomationLogsPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/whatsapp-mode` | `AdminWhatsAppModePage` | `@/pages/admin/AdminWhatsAppModePage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/whatsapp-logs` | `AdminWhatsAppLogsPage` | `@/pages/admin/AdminWhatsAppLogsPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/email-status` | `AdminEmailStatusPage` | `@/pages/admin/AdminEmailStatusPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/email-audit` | `AdminEmailAuditPage` | `@/pages/admin/AdminEmailAuditPage` | Sim | `ProtectedRoute` — admin, supervisor | `PageTransition` |
| `/admin/audit-evidence` | `AuditEvidenceDashboard` | `@/pages/admin/AuditEvidenceDashboard` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/dev-diagnostics` | `AdminDevDiagnosticsPage` | `@/pages/admin/AdminDevDiagnosticsPage` | Sim | `ProtectedRoute` — dev | `PageTransition` |
| `/admin/performance` | `PerformanceDashboard` | `@/pages/admin/PerformanceDashboard` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |
| `/admin/notification-channels` | `NotificationChannelsPage` | `@/pages/admin/notifications/NotificationChannelsPage` | Sim | `ProtectedRoute` — admin | `PageTransition` |
| `/admin/automations/cron` | `CronSchedulerPage` | `@/pages/admin/automacoes/CronSchedulerPage` | Sim | `ProtectedRoute` — admin, dev | `PageTransition` |

**Total de rotas:** 55 (24 em AppRoutes + 3 em DebugRoutes + 28 em AdminRoutes).

**Roles utilizados em `requiredRoles`:** `admin`, `dev`, `supervisor`, `manager`.

---

## 3. Guards — Lógica de Proteção de Rotas

### `ProtectedRoute` (`@/features/auth`)

Importado nos três arquivos de rotas. É o único mecanismo de proteção de rota no frontend.

**Dois modos de uso:**

**Modo 1 — Autenticação pura (sem `requiredRoles`):**
```tsx
<ProtectedRoute>
  <InboxPage />
</ProtectedRoute>
```
Exige apenas sessão autenticada válida (`supabase.auth`). Sem verificação de role.
Rotas que usam esse modo: `/`, `/inbox`, `/queue/:id`, `/queues/comparison`, `/sla`, `/sla/history`, `/sla/preferences`, `/sla/alerts`, `/chat-popup/:contactId`.

**Modo 2 — Autenticação + verificação de role (`requiredRoles`):**
```tsx
<ProtectedRoute requiredRoles={['admin', 'dev']}>
  <DesignSystem />
</ProtectedRoute>
```
Exige sessão autenticada E que o usuário possua ao menos um dos roles listados.
Rotas que usam esse modo: todas as `/admin/*`, `/debug/*`, `/design-system`, `/install`.

**Comportamento quando não autenticado:**
Redireciona para `/auth`. Quando autenticado mas sem o role exigido, redireciona para `/access-denied`.

### Rotas sem guard (públicas)

As seguintes rotas não possuem `ProtectedRoute` e são acessíveis sem sessão:

| Path | Justificativa |
|------|--------------|
| `/auth` | Tela de login |
| `/.lovable/oauth/consent` | Callback OAuth externo |
| `/forgot-password` | Recuperação de senha |
| `/reset-password` | Redefinição via token de email |
| `/verify-email` | Confirmação de email |
| `/auth/callback` | Callback SSO (Supabase) |
| `/2fa` | Segunda etapa de autenticação |
| `/access-denied` | Feedback de acesso negado |
| `/login`, `/chat-popup`, `/connections`, `/integrations` | Redirects de compat (sem conteúdo) |
| `*` (NotFound) | Página 404 pública |

### Distribuição de roles

| Role | Rotas com acesso exclusivo ou compartilhado |
|------|---------------------------------------------|
| `admin` (sozinho) | `/admin/roles`, `/admin/departments`, `/admin/rate-limit`, `/admin/failed-auth-messages`, `/admin/route-permissions`, `/admin/connections`, `/admin/audit-evidence`, `/admin/notification-channels`, `/install` |
| `dev` (sozinho) | `/admin/dev-diagnostics` |
| `admin` + `dev` | `/design-system`, `/admin/self-hosted-health`, `/admin/evo-api-health`, `/admin/security-logs`, `/admin/acl-alerts`, `/admin/performance`, `/admin/automations/cron`, `/debug/*` (3 rotas) |
| `admin` + `supervisor` | `/admin/hmac-selftest`, `/admin/operations`, `/admin/channels`, `/admin/queues`, `/admin/providers`, `/admin/inbox-sync-status`, `/admin/automations`, `/admin/automations/logs`, `/admin/whatsapp-mode`, `/admin/whatsapp-logs`, `/admin/email-status`, `/admin/email-audit` |
| `admin` + `dev` + `supervisor` | `/admin/bridge-status` |
| `admin` + `dev` + `manager` | `/admin/zappweb-demo` |

## Detalhamento das páginas ativas

### AccessDenied.tsx

- **Papel:** Página pública exibida pelo `ProtectedRoute` quando o usuário autenticado não possui o papel necessário para acessar uma rota. Registra o evento de acesso negado no backend.
- **Funcionalidades:**
  - Lê `location.state.from.pathname` para exibir qual rota foi tentada
  - Chama `supabase.auth.getUser()` no mount para obter o usuário atual
  - Chama `supabase.rpc('log_security_event', { p_event_type: 'unauthorized_access', p_resource: from, p_action: 'NAVIGATE', p_status: 'denied', p_details: {...} })`
  - Botão "Voltar" executa `navigate(-1)`
  - Botão "Ir para início" executa `navigate("/")`
- **Chama (saída):**
  - `supabase.auth.getUser()`
  - `supabase.rpc('log_security_event', ...)`
  - `useNavigate()`, `useLocation()`
- **Chamado por (entrada):**
  - `ProtectedRoute` via redirect quando `user.role` não satisfaz `requiredRoles`
- **Correlações:**
  - `ProtectedRoute` (quem redireciona para cá)
  - `AppRoutes.tsx` / `AdminRoutes.tsx` (definem `requiredRoles` nas rotas)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### Auth.tsx

- **Papel:** Página de login principal — suporta email/senha, passkey (WebAuthn) e Google OAuth. Exibe bloqueio de conta com countdown se o usuário estiver em lockout.
- **Funcionalidades:**
  - Delega toda a lógica de auth para `useAuthForm()` de `@/features/auth`
  - Exibe `blockReasonMessage` e countdown timer para contas bloqueadas
  - Renderiza `AuthDiagnosticsPanel` (diagnóstico de problemas de login)
  - Renderiza `SocialProof` e `HeroBenefits` (componentes de marketing lateral)
  - Usa `PasswordInput` para campo de senha
  - Link para `/forgot-password`
  - Suporta `?next=...` via searchParams para redirect pós-login
- **Chama (saída):**
  - `useAuthForm()` de `@/features/auth` (encapsula `supabase.auth.signInWithPassword`, passkey, OAuth)
- **Chamado por (entrada):**
  - Redirect de `ProtectedRoute` quando não há sessão
  - Link direto de `ForgotPassword`, `ResetPassword`, `SSOCallback`, `TwoFactorAuth`
  - URL `/auth`
- **Correlações:**
  - `ForgotPassword.tsx`, `ResetPassword.tsx` (fluxo de recuperação)
  - `SSOCallback.tsx` (destino de fallback em erro OAuth)
  - `TwoFactorAuth.tsx` (fluxo 2FA pós-login)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### ChatPopup.tsx

- **Papel:** Janela de chat popup independente para um contato específico (`:contactId` via URL param), abrível como janela separada do browser.
- **Funcionalidades:**
  - Lê `:contactId` via `useParams()`
  - Busca mensagens via `useMessages({ contactId, enabled })`
  - Busca dados do contato via `useContactData(contactId)`
  - Lazy-carrega `ChatPanel` de `@/features/inbox`
  - Envia texto: `dbFrom('messages').insert({ contact_id, content, sender: 'agent', message_type: 'text' })`
  - Envia áudio: `supabase.storage.from('whatsapp-media').upload(fileName, blob)` → `getSignedMediaUrl('whatsapp-media', fileName, 604800)` → `dbFrom('messages').insert({ ..., message_type: 'audio', media_url })`
  - Controles de janela: minimizar (`window.resizeTo(440, 48)`), maximizar/restaurar, fechar (`window.close()`)
  - Define `document.title = 'Chat — ${contact.name}'`
- **Chama (saída):**
  - `useMessages({ contactId, enabled })` de `@/hooks/useMessages`
  - `useContactData(contactId)` de `@/hooks`
  - `dbFrom('messages').insert(...)` (schema `zapp`)
  - `supabase.storage.from('whatsapp-media').upload(...)`, `getSignedMediaUrl(...)`
- **Chamado por (entrada):**
  - `window.open('/chat/:contactId', ...)` disparado de dentro do inbox
  - URL `/chat/:contactId`
- **Correlações:**
  - `InboxPage.tsx` / `RealtimeInboxView` (origem do popup)
  - Tabela `messages` (schema `zapp`)
  - Bucket `whatsapp-media`
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### DesignSystem.tsx

- **Papel:** Página estática de showcase do design system — documentação visual de componentes, tipografia, cores, badges, etc. Acessível apenas por admin/dev.
- **Funcionalidades:**
  - Importa `componentRegistry` de `@/components/ui/registry.json`
  - Renderiza `TypographyGuide` e `FontUsageGuide` de `@/components/docs/`
  - Exibe seções: tipografia, paleta de cores, botões, badges, dropdowns, tabelas, cards
  - Sem chamadas Supabase, sem fetch externo
- **Chama (saída):**
  - Nenhuma chamada de rede; apenas imports locais
- **Chamado por (entrada):**
  - Rota `/design-system` com `requiredRoles: ['admin', 'dev']`
  - Link no menu de desenvolvimento
- **Correlações:**
  - Nenhuma tabela Supabase referenciada
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### ForgotPassword.tsx

- **Papel:** Formulário de solicitação de redefinição de senha — envia email com link de recuperação.
- **Funcionalidades:**
  - Delega lógica ao hook `useForgotPassword()` de `@/hooks/useForgotPassword` (`{ email, setEmail, reason, setReason, loading, sent, error, handleSubmit }`)
  - Campo de email e campo opcional de razão
  - Estado "sent": exibe confirmação com instrução de verificar email
  - Link de volta para `/auth`
- **Chama (saída):**
  - `useForgotPassword()` (encapsula `supabase.auth.resetPasswordForEmail(...)`)
- **Chamado por (entrada):**
  - Link "Esqueceu a senha?" em `Auth.tsx`
  - URL `/forgot-password`
- **Correlações:**
  - `Auth.tsx` (link de origem), `ResetPassword.tsx` (próxima etapa após clicar no email)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### Index.tsx

- **Papel:** Página raiz protegida — bootstrapa autenticação e renderiza o shell principal da aplicação envolvido no `TourProvider`.
- **Funcionalidades:**
  - Implementado como `forwardRef<HTMLDivElement>`
  - Usa `useAuth()`, `useOnboarding()`, `useLoginAudit(user, loading)`
  - Redireciona para `/auth` se não há usuário após bootstrap
  - Renderiza `<TourProvider onComplete={completeOnboarding}><IndexContentConnected /></TourProvider>`
  - `IndexContentConnected` é o shell real da aplicação (inbox, sidebar, etc.)
- **Chama (saída):**
  - `useAuth()` de `@/features/auth`
  - `useOnboarding()` de `@/hooks`
  - `useLoginAudit(user, loading)` de `@/hooks`
- **Chamado por (entrada):**
  - Rota raiz `/` em `AppRoutes.tsx` (dentro de `ProtectedRoute`)
  - `SSOCallback`, `TwoFactorAuth`, `VerifyEmail` redirecionam para `/` após sucesso
- **Correlações:**
  - `IndexContentConnected` (shell interno com inbox)
  - `TourProvider` (onboarding tour)
- **Implementação:** COMPLETA (wrapper/bootstrapper — UI real em `IndexContentConnected`)
- **Runtime:** NAO_VERIFICADO

---

### Install.tsx

- **Papel:** Página de instalação do PWA — exibe prompt de instalação no browser ou instruções específicas para iOS.
- **Funcionalidades:**
  - Captura evento `beforeinstallprompt` do browser e armazena em estado
  - Detecta iOS via `navigator.userAgent` (`/iPad|iPhone|iPod/`)
  - Detecta modo standalone via `window.matchMedia('(display-mode: standalone)')`
  - Para iOS: exibe instruções manuais (Share → Add to Home Screen)
  - Para outros: botão que chama `deferredPrompt.prompt()` e verifica `userChoice.outcome`
  - Exibe mensagem se já instalado (standalone) ou se PWA não suportado
  - Sem chamadas Supabase
- **Chama (saída):**
  - `BeforeInstallPromptEvent` (browser API nativa)
  - `window.matchMedia`, `navigator.userAgent`
- **Chamado por (entrada):**
  - Rota `/install` com `requiredRoles: ['admin']`
  - Link no menu de configurações
- **Correlações:**
  - Nenhuma tabela Supabase
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### NotFound.tsx

- **Papel:** Página 404 — exibida quando nenhuma rota corresponde à URL acessada.
- **Funcionalidades:**
  - Importada estaticamente (não lazy) em `AppRoutes.tsx`
  - Loga via `getLogger('NotFound').error('404 Error: User attempted to access non-existent route:', location.pathname)`
  - Exibe `location.pathname` na UI
  - Botão "Voltar": `window.history.back()`
  - Link `<Link to="/">` para ir ao início
- **Chama (saída):**
  - `getLogger('NotFound')` de `@/lib/logger`
  - `useLocation()` (React Router)
- **Chamado por (entrada):**
  - Rota catch-all `*` em `AppRoutes.tsx`
- **Correlações:**
  - Nenhuma tabela Supabase
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### OAuthConsent.tsx

- **Papel:** Tela de consentimento OAuth para autorizações emitidas pelo Supabase Auth — permite ao usuário aprovar ou negar uma solicitação de autorização externa.
- **Funcionalidades:**
  - Lê `authorization_id` de `useSearchParams()`
  - Checa sessão via `supabase.auth.getSession()`; redireciona para `/auth?next=...` se sem sessão
  - Busca detalhes via beta API: `(supabase.auth as unknown as { oauth: OAuthNs }).oauth.getAuthorizationDetails(id)`
  - Botão "Aprovar": `.approveAuthorization(id)` → redireciona para `data.redirect_url`
  - Botão "Negar": `.denyAuthorization(id)` → redireciona para `data.redirect_url`
- **Chama (saída):**
  - `supabase.auth.getSession()`
  - `(supabase.auth as unknown as { oauth: OAuthNs }).oauth.getAuthorizationDetails(id)`
  - `.approveAuthorization(id)` / `.denyAuthorization(id)` (beta API)
- **Chamado por (entrada):**
  - Rota `/.lovable/oauth/consent` com `?authorization_id=...`
  - Fluxo OAuth externo onde o Supabase precisa de consentimento do usuário
- **Correlações:**
  - `Auth.tsx` (redirect se sem sessão)
  - `SSOCallback.tsx` (outro callback OAuth)
- **Implementação:** COMPLETA (caveat: usa cast TypeScript para API beta não tipada)
- **Runtime:** NAO_VERIFICADO

---

### QueueDetails.tsx

- **Papel:** Página de detalhes de uma fila de atendimento — exibe métricas, gráficos, membros da equipe e tabela de contatos.
- **Funcionalidades:**
  - Lê `:id` via `useParams()`
  - Usa `useAuth()` e `useQueueDetails(user ? id : undefined)` de `@/hooks/useQueueDetails`
  - Retorno de `useQueueDetails`: `{ queue, members, contacts, metrics, loading }`
  - Sub-componentes: `QueueCharts`, `QueueMetricsCards`, `QueueContactsTable`, `FloatingParticles`, `AuroraBorealis`, `PageHeader`
  - Lista membros com `member.profile.avatar_url`, `member.profile.name`, `member.profile.is_active`
  - Breadcrumbs: Filas → `queue.name`
- **Chama (saída):**
  - `useAuth()` de `@/features/auth`
  - `useQueueDetails(id)` de `@/hooks/useQueueDetails`
- **Chamado por (entrada):**
  - Rota `/queues/:id`
  - Link na lista de filas (possivelmente em `QueuesComparison` ou sidebar)
- **Correlações:**
  - `QueuesComparison.tsx` (visão comparativa de filas)
  - Tabelas `queues`, `queue_members`, `profiles` (schema `zapp`)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### QueuesComparison.tsx

- **Papel:** Dashboard de comparação entre filas de atendimento — thin wrapper que delega a visualização para `QueuesComparisonDashboard`.
- **Funcionalidades:**
  - Usa `useAuth()` e `useNavigate()`
  - Redireciona para `/auth` se não há usuário após bootstrap
  - Loading state com `AuroraBorealis`, `FloatingParticles` e `Skeleton` (4 cards + 1 chart)
  - Renderiza `<QueuesComparisonDashboard />` de `@/components/queues/QueuesComparisonDashboard`
- **Chama (saída):**
  - `useAuth()` de `@/features/auth`
  - `useNavigate()` (React Router)
- **Chamado por (entrada):**
  - Rota `/queues/comparison` ou via menu lateral
- **Correlações:**
  - `QueueDetails.tsx` (detalhes de uma fila individual)
  - Tabelas `queues` (schema `zapp`)
- **Implementação:** COMPLETA (thin wrapper — lógica em `QueuesComparisonDashboard`)
- **Runtime:** NAO_VERIFICADO

---

### ResetPassword.tsx

- **Papel:** Formulário de redefinição de senha — acessado via link de recuperação enviado por email; valida complexidade de senha e atualiza credencial no Supabase Auth.
- **Funcionalidades:**
  - Verifica sessão via `supabase.auth.onAuthStateChange` (evento `PASSWORD_RECOVERY`) e `supabase.auth.getSession()`
  - Exibe "Link Inválido" e botão para `/forgot-password` se não há sessão
  - Validação Zod: mínimo 8 chars, maiúscula, minúscula, número, caractere especial
  - Renderiza `PasswordStrengthMeter` de `@/features/auth`
  - Mostrar/ocultar senha com toggle
  - Submissão via `supabase.auth.updateUser({ password })`
  - Após sucesso: countdown de 5s para `/auth` com opção de cancelar redirecionamento
- **Chama (saída):**
  - `supabase.auth.onAuthStateChange(...)`
  - `supabase.auth.getSession()`
  - `supabase.auth.updateUser({ password })`
- **Chamado por (entrada):**
  - Link de email de recuperação de senha enviado pelo Supabase Auth
  - URL `/reset-password` com token no hash
- **Correlações:**
  - `ForgotPassword.tsx` (passo anterior), `Auth.tsx` (destino após reset)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### SLAAlertHistory.tsx

- **Papel:** Histórico de alertas de SLA — lista alertas de atendimento (em risco / violado / resolvido) com filtragem por texto e severidade e ação de resolução inline.
- **Funcionalidades:**
  - Busca dados via `useSLAAlertHistory()` de `@/features/sla` (`{ data, isLoading, refetch, isFetching, resolveAlert, isResolving }`)
  - Filtro por texto: pesquisa em `contactName`, `contactPhone`, `threadId`
  - Filtro toggle por severidade: 'all' / 'risk' / 'violated'
  - Componente `HistoryRow` inline: exibe status, badges, botão "Resolver"
  - Botão "Atualizar" dispara `refetch()`
  - Estado vazio via `GenericEmptyState` adaptado ao filtro ativo
  - Sidebar com `currentView='sla-history'`
- **Chama (saída):**
  - `useSLAAlertHistory()` de `@/features/sla`
- **Chamado por (entrada):**
  - Sidebar (item 'sla-history')
  - Rota `/sla/alerts/history`
- **Correlações:**
  - `SLADashboard.tsx`, `SLAHistory.tsx`, `SLAAlertPreferences.tsx` (mesma feature SLA)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### SLAAlertPreferences.tsx

- **Papel:** Página de preferências de alertas de SLA por usuário — controla quais tipos e severidades de alerta o usuário deseja receber.
- **Funcionalidades:**
  - Busca/salva prefs via `useSLAAlertPreferences()` de `@/features/sla` (`{ preferences, save, isLoading, isSaving }`)
  - Master switch `enabled` — quando desligado, silencia toasts e pula inserts de auditoria
  - Toggles de tipo: `alert_first_response`, `alert_resolution`
  - Toggles de severidade: `severity_warning` (≥70% prazo), `severity_breached` (prazo ultrapassado)
  - Estado draft com dirty check; botão "Salvar" e "Descartar"
  - Seção de tipo/severidade desabilitada visualmente quando master switch está off
  - Sidebar com `currentView='settings'`
- **Chama (saída):**
  - `useSLAAlertPreferences()` de `@/features/sla`
- **Chamado por (entrada):**
  - Sidebar (item 'settings') / configurações de notificações
  - Rota `/settings/sla-alerts`
- **Correlações:**
  - `SLAAlertHistory.tsx`, `SLADashboard.tsx` (mesma feature SLA)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### SLADashboard.tsx

- **Papel:** Página wrapper para o dashboard principal de SLA — thin wrapper com Sidebar e ErrorBoundary ao redor de `SLADashboardComponent`.
- **Funcionalidades:**
  - Renderiza `<SLADashboard />` de `@/components/queues/SLADashboard` dentro de `SectionErrorBoundary`
  - Sidebar com `currentView='sla'`
- **Chama (saída):**
  - Nenhum hook direto — delega para `SLADashboardComponent`
- **Chamado por (entrada):**
  - Sidebar (item 'sla')
  - Rota `/sla`
- **Correlações:**
  - `SLAHistory.tsx`, `SLAAlertHistory.tsx`, `SLAAlertPreferences.tsx`
- **Implementação:** COMPLETA (thin wrapper — lógica em `SLADashboardComponent`)
- **Runtime:** NAO_VERIFICADO

---

### SLAHistory.tsx

- **Papel:** Histórico detalhado de SLA com duas abas: métricas de atendimento e histórico de entregas/leituras de mensagens.
- **Funcionalidades:**
  - Tab "Atendimento": renderiza `SLAHistoryDashboard` de `@/features/sla`
  - Tab "Entregas & Leituras": renderiza `SLADeliveryHistoryDashboard` de `@/features/sla`
  - Efeitos visuais `AuroraBorealis` e `FloatingParticles`
  - Cada tab envolto em `SectionErrorBoundary`
  - Sidebar com `currentView='sla-history'`
- **Chama (saída):**
  - `SLAHistoryDashboard` e `SLADeliveryHistoryDashboard` de `@/features/sla`
- **Chamado por (entrada):**
  - Sidebar (item 'sla-history')
  - Rota `/sla/history`
- **Correlações:**
  - `SLADashboard.tsx`, `SLAAlertHistory.tsx`
- **Implementação:** COMPLETA (thin wrapper — lógica em `SLAHistoryDashboard` / `SLADeliveryHistoryDashboard`)
- **Runtime:** NAO_VERIFICADO

---

### SSOCallback.tsx

- **Papel:** Página de callback OAuth/SSO — processa o retorno de autenticação externa (Google, etc.) e redireciona para o destino correto considerando MFA.
- **Funcionalidades:**
  - Assina `supabase.auth.onAuthStateChange` para evento `SIGNED_IN` (unconditional, antes de qualquer check)
  - Sanitiza parâmetros de erro do URL hash (`error`, `error_description`) — trunca a 200 chars, escapa `<>"'&`
  - Checa sessão existente via `supabase.auth.getSession()`
  - Após autenticação bem-sucedida: verifica MFA via `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`; se aal1→aal2 redireciona para `/2fa`, senão para `/`
  - Timeout de 10s se nenhum evento de auth chegar
  - 3 estados visuais: loading (spinner animado), success (CheckCircle), error (XCircle + botão retry)
- **Chama (saída):**
  - `supabase.auth.onAuthStateChange(...)`
  - `supabase.auth.getSession()`
  - `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
- **Chamado por (entrada):**
  - Callback URL OAuth configurado no provedor (Google, etc.) e no Supabase Auth
  - URL `/auth/callback` (ou equivalente configurado)
- **Correlações:**
  - `Auth.tsx` (origem do fluxo OAuth), `TwoFactorAuth.tsx` (redirect se 2FA pendente), `OAuthConsent.tsx`
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### TwoFactorAuth.tsx

- **Papel:** Tela de verificação de segundo fator (TOTP) — exigida após login quando o usuário tem MFA configurado mas ainda não completou o challenge na sessão atual.
- **Funcionalidades:**
  - Aguarda bootstrap de sessão antes de agir (`if (loading) return`)
  - Redireciona para `/auth` se sem usuário
  - Chama `fetchFactors()` e `getAssuranceLevel()` de `useMFA()` de `@/features/auth`
  - Se `currentLevel === 'aal1'` e `nextLevel === 'aal2'`: exibe `MFAVerify` component
  - Se já aal2 ou sem MFA configurado: redireciona para `/`
  - `onSuccess` de `MFAVerify`: `navigate('/')`
  - `onCancel` de `MFAVerify`: `supabase.auth.signOut()` → `navigate('/auth')`
  - Botão "Voltar para login": `navigate('/auth')`
- **Chama (saída):**
  - `useAuth()` de `@/features/auth`
  - `useMFA()` de `@/features/auth` (`fetchFactors`, `getAssuranceLevel`)
  - `MFAVerify` de `@/features/auth`
  - `supabase.auth.signOut()`
- **Chamado por (entrada):**
  - `SSOCallback.tsx` (redirect quando aal1→aal2 pós-OAuth)
  - Rota `/2fa`
- **Correlações:**
  - `SSOCallback.tsx` (origem), `Auth.tsx` (cancelar/voltar)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### VerifyEmail.tsx

- **Papel:** Página de verificação de email — processa o link de confirmação de cadastro ou troca de email enviado pelo Supabase Auth.
- **Funcionalidades:**
  - Assina `supabase.auth.onAuthStateChange` para evento `SIGNED_IN`
  - Lê `searchParams.get('type')` para distinguir `signup` / `email_change` / outros
  - Para 'signup' e 'email_change': chama `supabase.auth.getSession()` imediatamente
  - Para outros tipos: aguarda 2s antes de checar sessão (para Supabase processar o token)
  - 4 estados: `loading` / `success` / `error` / `expired`
  - Estado `success`: exibe email verificado e botão para `/`
  - Estado `error`: botão "Reenviar Email" via `supabase.auth.resend({ type: 'signup', email })`
  - Estado `expired`: botão para voltar ao `/auth`
- **Chama (saída):**
  - `supabase.auth.onAuthStateChange(...)`
  - `supabase.auth.getSession()`
  - `supabase.auth.resend({ type: 'signup', email })`
- **Chamado por (entrada):**
  - Link de email de verificação/confirmação enviado pelo Supabase Auth
  - URL `/verify-email?type=signup` ou `/verify-email?type=email_change`
- **Correlações:**
  - `Auth.tsx`, `ResetPassword.tsx` (outros fluxos de email auth)
- **Implementação:** COMPLETA
- **Runtime:** NAO_VERIFICADO

---

### inbox/InboxPage.tsx

- **Papel:** Página principal do inbox omnichannel — thin wrapper que delega toda a renderização para `RealtimeInboxView`.
- **Funcionalidades:**
  - Renderiza `<RealtimeInboxView />` de `@/features/inbox`
  - Sem lógica própria, sem hooks diretos
- **Chama (saída):**
  - `RealtimeInboxView` de `@/features/inbox`
- **Chamado por (entrada):**
  - Rota `/` via `IndexContentConnected` (shell principal)
  - Menu principal / sidebar
- **Correlações:**
  - `ChatPopup.tsx` (janela de chat popup originada do inbox)
  - `RealtimeInboxView` (onde estão `useMessages`, subscriptions Realtime em `evo.evolution_messages`, `evo.evolution_conversations`)
  - Tabelas `evo.evolution_messages`, `evo.evolution_conversations`, `zapp.contatos`
- **Implementação:** COMPLETA (thin wrapper — lógica em `RealtimeInboxView`)
- **Runtime:** NAO_VERIFICADO

## Páginas órfãs (128 arquivos não referenciados em AppRoutes.tsx)

> Nenhuma destas páginas aparece em AppRoutes.tsx. Podem ser: features em desenvolvimento, código legado, sub-componentes de página nomeados como Page, ou rotas de outros sistemas.

| Arquivo | Linhas | Tabelas Supabase | RPCs | Issues | Exports |
|---------|--------|-----------------|------|--------|---------|
| pages/AdminAlertHistoryPage.tsx | 394 | — | — | — | AdminAlertHistoryPage |
| pages/AdminAlertHistoryPageParts.tsx | 55 | — | — | — | RANGES, STATUS, TypeBadge |
| pages/AdminDispatchErrorsHistoryPage.tsx | 187 | — | — | — | AdminDispatchErrorsHistoryPage |
| pages/AdminEvolutionApiLogsPage.tsx | 356 | — | — | — | AdminEvolutionApiLogsPage |
| pages/AdminEvolutionApiLogsPageParts.tsx | 75 | — | — | — | RANGE, STATUS, StatusBadge |
| pages/AdminFailedMessagesPage.tsx | 238 | — | — | return-null | AdminFailedMessagesPage |
| pages/AdminInstancePausesPage.tsx | 296 | — | — | — | AdminInstancePausesPage |
| pages/AdminRealtimeMonitorPage.tsx | 123 | — | — | — | AdminRealtimeMonitorPage |
| pages/AdminSearchInsightsPage.tsx | 110 | — | — | empty-handlers | AdminSearchInsightsPage |
| pages/AdminTelemetriaPage.tsx | 178 | — | — | — | AdminTelemetriaPage |
| pages/AdminWebhookEventsPage.tsx | 216 | — | — | — | AdminWebhookEventsPage |
| pages/AdminWebhookOverviewPage.tsx | 195 | — | — | — | AdminWebhookOverviewPage |
| pages/AdminWebhookSecretStatusPage.tsx | 220 | — | — | — | AdminWebhookSecretStatusPage |
| pages/BackendDiagnostics.tsx | 118 | — | — | — | BackendDiagnostics |
| pages/RealtimeFanoutDebug.tsx | 287 | — | — | — | RealtimeFanoutDebug |
| pages/SendStatusBusDebug.tsx | 334 | — | — | — | SendStatusBusDebug |
| pages/ViewRouter.tsx | 305 | — | — | — | ViewRouter |
| pages/__tests__/NotFound.test.tsx | 94 | — | — | — | — |
| pages/admin/AdminACLAlertsPage.tsx | 217 | — | — | return-null | AdminACLAlertsPage |
| pages/admin/AdminAutomationLogsPage.tsx | 336 | — | — | — | AdminAutomationLogsPage |
| pages/admin/AdminAutomationsPage.tsx | 791 | — | — | — | AdminAutomationsPage |
| pages/admin/AdminBridgeStatusPage.tsx | 184 | — | — | — | BridgeStatusPage |
| pages/admin/AdminChannelsPage.tsx | 574 | — | — | — | AdminChannelsPage |
| pages/admin/AdminDevDiagnosticsPage.tsx | 209 | — | — | — | AdminDevDiagnosticsPage |
| pages/admin/AdminEmailAuditPage.tsx | 312 | — | — | — | AdminEmailAuditPage |
| pages/admin/AdminEmailStatusPage.tsx | 350 | — | — | — | AdminEmailStatusPage |
| pages/admin/AdminEvoApiHealthPage.tsx | 250 | — | — | — | AdminEvoApiHealthPage |
| pages/admin/AdminFailedAuthMessagesPage.tsx | 245 | — | — | — | AdminFailedAuthMessagesPage |
| pages/admin/AdminInboxSyncStatusPage.tsx | 322 | — | — | — | AdminInboxSyncStatusPage |
| pages/admin/AdminOperationsPage.tsx | 71 | — | — | — | AdminOperationsPage |
| pages/admin/AdminProvidersPage.tsx | 376 | — | — | — | AdminProvidersPage |
| pages/admin/AdminQueuesPage.tsx | 148 | — | — | — | AdminQueuesPage |
| pages/admin/AdminSecurityLogsPage.tsx | 165 | — | — | — | AdminSecurityLogsPage |
| pages/admin/AdminWhatsAppLogsPage.tsx | 311 | — | — | — | AdminWhatsAppLogsPage |
| pages/admin/AdminWhatsAppModePage.tsx | 164 | — | — | — | AdminWhatsAppModePage |
| pages/admin/AdminWhatsAppSecretsCard.tsx | 205 | — | — | — | AdminWhatsAppSecretsCard |
| pages/admin/AdminWhatsAppWebhookVerifyCard.tsx | 224 | — | — | return-null | AdminWhatsAppWebhookVerifyCard |
| pages/admin/AuditEvidenceDashboard.tsx | 227 | — | — | — | — |
| pages/admin/AutomationRuleDialog.tsx | 174 | — | — | — | AutomationRuleDialog |
| pages/admin/Connections.tsx | 774 | — | — | — | AdminConnectionsPage |
| pages/admin/DepartmentsPage.tsx | 304 | — | — | — | DepartmentsPage |
| pages/admin/HmacSelfTestPage.tsx | 331 | — | — | — | HmacSelfTestPage |
| pages/admin/PerformanceDashboard.tsx | 164 | — | — | — | PerformanceDashboard |
| pages/admin/RateLimitDashboard.tsx | 490 | — | — | — | RateLimitDashboard |
| pages/admin/RolesPage.tsx | 186 | — | — | — | RolesPage |
| pages/admin/RoutePermissionsPage.tsx | 255 | — | — | — | RoutePermissionsPage |
| pages/admin/SelfHostedHealthPage.tsx | 188 | — | — | — | SelfHostedHealthPage |
| pages/admin/ZappWebbDemoPage.tsx | 400 | — | — | return-null | ZappWebbDemoPage |
| pages/admin/adminWhatsAppModeTypes.ts | 66 | — | — | — | SECRET |
| pages/admin/automacoes/CronSchedulerPage.tsx | 271 | — | — | — | CronSchedulerPage |
| pages/admin/automationLogsHelpers.tsx | 100 | — | — | — | STATUS, PAGE, Section, KV, Pre |
| pages/admin/automationRuleDialogParts.tsx | 314 | — | — | return-null | TriggerConfigFields, AutomationActionsFields |
| pages/admin/bridge-status/BridgeCoreServicesCard.tsx | 130 | — | — | — | BridgeCoreServicesCard |
| pages/admin/bridge-status/BridgeDiagnosticsDialog.tsx | 115 | — | — | — | BridgeDiagnosticsDialog |
| pages/admin/bridge-status/BridgeSidebarPanel.tsx | 100 | — | — | — | BridgeSidebarPanel |
| pages/admin/bridge-status/BridgeStatusBanner.tsx | 51 | — | — | — | BridgeStatusBanner |
| pages/admin/connections/ConnectionsIntegrationsTab.tsx | 77 | — | — | — | ConnectionsIntegrationsTab |
| pages/admin/connections/ConnectionsMcpTab.tsx | 88 | — | — | — | ConnectionsMcpTab |
| pages/admin/connections/ConnectionsWebhooksTab.tsx | 94 | — | — | — | ConnectionsWebhooksTab |
| pages/admin/email/useEmailHealthStatus.ts | 179 | — | — | empty-handlers | — |
| pages/admin/inboxSyncUtils.ts | 121 | — | — | — | INSTANCE, POLL, BUCKET, ALERT, DEFAULT, MIN, MAX |
| pages/admin/notifications/NotificationChannelsPage.tsx | 396 | — | — | — | NotificationChannelsPage |
| pages/admin/operations/MediaPipelineStats.tsx | 208 | — | — | — | MediaPipelineStats |
| pages/admin/operations/OpsLogsTab.tsx | 297 | — | — | — | OpsLogsTab |
| pages/admin/operations/OpsMetricsTab.tsx | 320 | — | — | — | OpsMetricsTab |
| pages/admin/operations/OpsTransfersTab.tsx | 239 | — | — | — | OpsTransfersTab |
| pages/admin/queues/QueueCard.tsx | 188 | — | — | — | QueueCard |
| pages/admin/queues/QueueEditDialog.tsx | 246 | — | — | — | QueueEditDialog |
| pages/admin/queues/QueueMembersDialog.tsx | 282 | — | — | — | QueueMembersDialog |
| pages/admin/useAdminInboxSync.ts | 3 | — | — | — | — |
| pages/admin/useAdminWhatsAppMode.ts | 197 | — | — | — | — |
| pages/admin/useAutomationLogs.ts | 3 | — | — | — | — |
| pages/admin/useConnections.ts | 8 | — | — | — | — |
| pages/admin/useWhatsAppLogs.ts | 2 | — | — | — | — |
| pages/admin/whatsappLogsHelpers.tsx | 153 | — | — | — | OFFICIAL, UNOFFICIAL, OFFICIAL, UNOFFICIAL, EmptyState |
| pages/admin-realtime-monitor/ConnectionsHealthBlock.tsx | 125 | — | — | — | ConnectionsHealthBlock |
| pages/admin-realtime-monitor/DispatchErrorsBlock.tsx | 150 | — | — | — | DispatchErrorsBlock |
| pages/admin-realtime-monitor/EventsLiveBlock.tsx | 226 | — | — | — | EventsLiveBlock |
| pages/admin-realtime-monitor/aggregations.ts | 137 | — | — | return-null | — |
| pages/admin-search-insights/SearchInsightsKPICards.tsx | 75 | — | — | — | SearchInsightsKPICards |
| pages/admin-search-insights/SearchInsightsTables.tsx | 60 | — | — | — | SearchInsightsTables |
| pages/admin-telemetria/ClientTelemetryPanel.tsx | 143 | — | — | — | ClientTelemetryPanel |
| pages/admin-telemetria/TelemetryStatsCards.tsx | 62 | — | — | — | TelemetryStatsCards |
| pages/admin-telemetria/TelemetryTable.tsx | 90 | — | — | — | TelemetryTable |
| pages/admin-telemetria/TelemetryTopOffenders.tsx | 46 | — | — | return-null | TelemetryTopOffenders |
| pages/admin-telemetria/telemetryTypes.ts | 22 | — | — | — | — |
| pages/admin-telemetria/telemetryUtils.tsx | 45 | — | — | — | — |
| pages/admin-webhook-events/WebhookEventsTable.tsx | 229 | — | — | — | WebhookEventsTable |
| pages/admin-webhook-events/WebhookFiltersCard.tsx | 222 | — | — | — | WebhookFiltersCard |
| pages/admin-webhook-events/useWebhookEvents.ts | 221 | — | — | return-null | EVENT, MESSAGE, STATUS, RANGE |
| pages/admin-webhook-overview/CallCorrelationView.tsx | 211 | — | — | — | CallCorrelationView |
| pages/admin-webhook-overview/KpiCard.tsx | 31 | — | — | — | KpiCard |
| pages/admin-webhook-overview/LoadingSkeleton.tsx | 15 | — | — | — | LoadingSkeleton |
| pages/admin-webhook-overview/WebhookChartsSection.tsx | 121 | — | — | — | WebhookChartsSection |
| pages/admin-webhook-overview/WebhookDetailTable.tsx | 71 | — | — | — | WebhookDetailTable |
| pages/admin-webhook-overview/WebhookMatrixTable.tsx | 97 | — | — | return-null | WebhookMatrixTable |
| pages/admin-webhook-overview/__tests__/aggregations.test.ts | 429 | — | — | — | — |
| pages/admin-webhook-overview/aggregations.ts | 147 | — | — | — | — |
| pages/admin-webhook-overview/callCorrelation.ts | 181 | — | — | return-null | — |
| pages/admin-webhook-overview/useWebhookOverview.ts | 105 | — | — | — | HARD |
| pages/admin-webhook-secret-status/AdvancedFiltersPanel.tsx | 390 | — | — | empty-handlers, return-null | AdvancedFiltersPanel |
| pages/admin-webhook-secret-status/AlertThresholdsPanel.tsx | 229 | — | — | — | AlertThresholdsPanel |
| pages/admin-webhook-secret-status/HmacAuditHistoryPanel.tsx | 309 | — | — | — | HmacAuditHistoryPanel |
| pages/admin-webhook-secret-status/HmacSelfTestButton.tsx | 265 | — | — | — | HmacSelfTestButton |
| pages/admin-webhook-secret-status/HmacSelfTestResultPanel.tsx | 172 | — | — | — | HmacSelfTestResultPanel |
| pages/admin-webhook-secret-status/InstanceBreakdownTable.tsx | 194 | — | — | — | InstanceBreakdownTable |
| pages/admin-webhook-secret-status/InstanceFilterSelect.tsx | 56 | — | — | — | InstanceFilterSelect |
| pages/admin-webhook-secret-status/InstanceStatusCards.tsx | 131 | — | — | — | InstanceStatusCards |
| pages/admin-webhook-secret-status/RecheckResultDialog.tsx | 120 | — | — | — | RecheckResultDialog |
| pages/admin-webhook-secret-status/WebhookAlertHistoryPanel.tsx | 191 | — | — | — | WebhookAlertHistoryPanel |
| pages/admin-webhook-secret-status/WebhookEventsTable.tsx | 194 | — | — | — | WebhookEventsTable |
| pages/admin-webhook-secret-status/WebhookKpiCards.tsx | 177 | — | — | — | WebhookKpiCards |
| pages/admin-webhook-secret-status/WebhookValidationMetaCard.tsx | 76 | — | — | — | WebhookValidationMetaCard |
| pages/admin-webhook-secret-status/hmacAuditHistoryHelpers.ts | 78 | — | — | — | RANGES, ALL |
| pages/admin-webhook-secret-status/hmacSelfTestTypes.ts | 47 | — | — | — | — |
| pages/admin-webhook-secret-status/instanceAggregations.ts | 155 | — | — | — | — |
| pages/admin-webhook-secret-status/useAdminWebhookStatus.ts | 307 | — | — | — | — |
| pages/admin-webhook-secret-status/useHmacAuditHistory.ts | 125 | — | — | — | — |
| pages/failed-messages/FailedMessageDetailsSheet.tsx | 128 | — | — | — | FailedMessageDetailsSheet |
| pages/failed-messages/FailedMessagesBulkAbandonDialog.tsx | 52 | — | — | — | FailedMessagesBulkAbandonDialog |
| pages/failed-messages/FailedMessagesBulkActions.tsx | 62 | — | — | return-null | FailedMessagesBulkActions |
| pages/failed-messages/FailedMessagesErrorCodeChart.tsx | 51 | — | — | return-null | FailedMessagesErrorCodeChart |
| pages/failed-messages/FailedMessagesFilters.tsx | 171 | — | — | — | FailedMessagesFilters |
| pages/failed-messages/FailedMessagesRootCauseChart.tsx | 74 | — | — | return-null | FailedMessagesRootCauseChart |
| pages/inbox/AgentsOperationsPage.tsx | 130 | — | — | — | AgentsOperationsPage |
| pages/lazyViews.ts | 164 | — | — | — | RealtimeInboxView, DashboardView, SentimentAlertsDashboard, AgentsView, QueuesView, ContactsView, ConnectionsView, ConnectionsIntegrationsHub, TagsView, SettingsView, ClientWalletView, AdminView, ProductManagement, GroupsView, TranscriptionsHistoryView, AdvancedReportsView, SecurityView, SystemFeaturesView, CampaignsView, ChatbotFlowsView, AutomationsManager, IntegrationsHub, LGPDComplianceView, SalesPipelineView, KnowledgeBaseView, PaymentLinksView, WhatsAppFlowsBuilder, MetaCAPIView, DiagnosticsView, VoIPPanel, AutoExportManager, GoogleCalendarIntegration, ThemeCustomizer, ScheduleCalendarView, WarRoomDashboard, WhatsAppTemplatesManager, OmnichannelManager, ChurnPredictionDashboard, AutoTicketClassifier, PerformanceMonitor, OmnichannelInbox, AuditLogDashboard, AdminTelemetriaPage, AdminFailedMessagesPage, AdminFailedAuthMessagesPage, AdminSearchInsightsPage, AdminWebhookEventsPage, AdminEvolutionApiLogsPage, AdminAlertHistoryPage, AdminWebhookOverviewPage, NPSDashboard, SLADashboardView, TeamChatView, EmailInboxView, EmailChatView, PublicApiDashboard, EmailWebhookMonitor, MediaMigrationTool, SicoobBridgeDashboard, CRM360ExplorerView, AIUsageDashboard, TalkXView, EvolutionMonitoringDashboard, AdminWebhookSecretStatusPage, AdminInstancePausesPage, AgentsOperationsPage, AdminRealtimeMonitorPage, AdminDispatchErrorsHistoryPage, AdminInboxSyncStatusPage, AdminEvoApiHealthPage, AdminEmailStatusPage, AdminEmailAuditPage, AdminConnectionsPage, NotificationChannelsPage, CronSchedulerPage, InboxPage, SLAHistory, AchievementsSystemLazy |
| pages/queue-details/QueueContactsTable.tsx | 76 | — | — | — | QueueContactsTable |
| pages/queue-details/QueueMetricsCards.tsx | 41 | — | — | — | QueueMetricsCards |

### Achados nas páginas órfãs

- **0 páginas órfãs acessam tabelas Supabase** (funcionalidade real, não código vazio): 
- **0 páginas órfãs chamam RPCs**
- **16 páginas órfãs têm issues** (handlers vazios, return null, throw not implemented)
- **1 páginas órfãs têm TODOs/FIXMEs**
