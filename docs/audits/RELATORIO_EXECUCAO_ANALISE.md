# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.
>
> **Instância:** Chat de análise. Correção é responsabilidade do próximo chat.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 |
| 2 | Auditoria do banco (11-20) | ⏳ Em execução | — |
| 3 | Autenticação e sessão (21-30) | ⏸ Pendente | — |
| 4 | Inbox e mensageria (31-45) | ⏸ Pendente | — |
| 5 | Contatos e CRM (46-55) | ⏸ Pendente | — |
| 6 | Conexões WhatsApp (56-65) | ⏸ Pendente | — |
| 7 | Admin e monitoramento (66-75) | ⏸ Pendente | — |
| 8 | SLA/BPM (76-80) | ⏸ Pendente | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

### Etapa 1 — Contagem de arquivos por extensão em `src/`

Fonte: árvore do repositório via `github_get_contents` recursivo.

- `src/pages/`: **46 arquivos `.tsx` na raiz** + 15 subpastas (`admin/`, `admin-realtime-monitor/`, `admin-search-insights/`, `admin-telemetria/`, `admin-webhook-events/`, `admin-webhook-overview/`, `admin-webhook-secret-status/`, `failed-messages/`, `inbox/`, `queue-details/`, `__tests__/`).
- `src/features/`: 10 slices (`admin`, `auth`, `business-logic`, `connections`, `contacts`, `dashboard`, `emojis`, `inbox`, `integrations`, `sla`).
- `src/components/`, `src/hooks/`, `src/services/`, `src/lib/`, `src/utils/`, `src/adapters/`, `src/data/`, `src/i18n/`, `src/integrations/`, `src/shared/`, `src/styles/`, `src/types/`.
- **5 pastas de teste distintas** convivendo: `src/__tests__/`, `src/test/`, `src/tests/`, `src/pages/__tests__/`, `src/features/*/__tests__/`, e `tests/` + `e2e/` na raiz.

### Etapa 2 — Rotas React Router

Fonte: `src/components/routing/AppRoutes.tsx`, `AdminRoutes.tsx`, `DebugRoutes.tsx`, `src/pages/lazyViews.ts`.

- **21 rotas top-level** em `AppRoutes.tsx` (auth, SLA, install, chat-popup, inbox, etc.).
- **27 rotas `/admin/*`** em `AdminRoutes.tsx` com `<ProtectedRoute requiredRoles={[...]}>`.
- **N rotas debug** em `DebugRoutes.tsx` (2 KB — provavelmente 5-8 rotas).
- **74+ views/pages lazy-loaded** em `lazyViews.ts` (74 exports `lazyWithRetry`).
- **4 redirects de compatibilidade** (`/login`, `/chat-popup`, `/connections`, `/integrations`).
- Catch-all `*` → `NotFound`.

### Etapa 3 — Navegação/menu

Fonte inferida: `src/pages/lazyViews.ts` + `src/pages/ViewRouter.tsx` (10 KB).

- Sistema usa dois padrões de navegação simultâneos:
  1. URLs canônicas (`/admin/roles`, `/sla`, `/inbox`, etc.).
  2. Query-string `?view=X&tab=Y` roteado por `ViewRouter.tsx` (10245 bytes).
- Redirects `/connections → /?view=connections&tab=connections` mostram que views internas migraram de URL para query, sem cleanup.

### Etapa 4 — Componentes UI

- Radix primitives: **28 pacotes `@radix-ui/react-*`** em `package.json`.
- shadcn wrappers em `src/components/ui/`: `toaster`, `sonner`, `skeleton`, `skip-link`, `visually-hidden`, `tooltip`, `command` (via `cmdk`), etc.
- Componentes de domínio: por feature (`components/inbox/`, `components/admin/`, `components/dashboard/`, etc.).

### Etapa 5 — Inventário de pages

Contagem detalhada:
- 46 arquivos `.tsx` diretamente em `src/pages/`.
- 15 subpastas com sua própria `index.tsx` ou `Parts.tsx`.
- **Homônimos**: `AdminAlertHistoryPage.tsx` E `admin-realtime-monitor/` E `AdminRealtimeMonitorPage.tsx` — convenção quebrada.

### Etapa 6-8 — Hooks, services, contexts

- Providers principais (ordem): `ErrorBoundary → QueryClientProvider → ValidationProvider → AuthProvider → ThemeSync → HighContrastProvider → TooltipProvider → children`.
- `QueryClient`: `staleTime: 10min`, `gcTime: 60min`, `retry: tanstackRetry` (401/403/42501/42P01 nunca retentados).
- Providers deferidos após `requestAnimationFrame + setTimeout(800ms)`: `RealtimeSentimentAlertProvider`, `IncomingCallAlert`, `EasterEggsProvider`, `InAppNotificationProvider`, `DeferredHooks` (useServiceWorker + useScreenProtection + BuildVersionWatcher).

### Etapa 9 — Barrels e tsconfig paths

- Paths configurados em `tsconfig.app.json` (a validar detalhe).
- `bun run check:barrels` existe em `scripts/validate-barrels.ts`.

### Etapa 10 — Dead code

- Script existente: `scripts/check-dead-code.mjs`. Não foi executado, mas é um gate documentado.
- **Sinais de código morto detectados por leitura direta**:
  - `supabase/functions-legacy/` (nome auto-explicativo).
  - `supabase/fatorx-migrations/` (projeto errado).
  - `playwright.e2e.config.fixed.ts` (duplicata de `playwright.e2e.config.ts`).
  - `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt` na raiz.
  - `__pycache__/` versionado.
  - `ci_cost_analysis.py` e `gen_insert.cjs` fora de `scripts/`.
  - `lgpd_deploy.sql` na raiz (não em `supabase/migrations/`).
  - 8 relatórios `.md` na raiz (deveriam estar em `docs/audits/`).

---

## Achados do Bloco 1 (14 itens que viraram etapas em `PLANO_IMPLEMENTACAO_100.md`)

Todos numerados de F1-01 a F1-14 e catalogados no plano de correção.

Continua no Bloco 2 →
