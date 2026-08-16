# Estado: Components Pequenos, Dispersos e src/shared/

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 36/36

## 1. Visão Geral

18 diretórios pequenos de `src/components/` mais 6 arquivos na raiz de `src/components/` e todo o `src/shared/`. O conjunto é heterogêneo: providers globais de altíssima criticidade (`AppProviders`, `ErrorBoundary`), views de feature completas (`GroupsView`, `PaymentLinksView`), sub-componentes puramente internos (`LeaderboardHelpers`, `FlowComponentPreview`) e a camada de contratos/schemas compartilhados (`src/shared/`). A biblioteca está inflada: 4 arquivos sem importadores fora do próprio diretório.

| arquivo | linhas | o que faz | status | implementação |
|---------|--------|-----------|--------|---------------|
| `components/CommandPalette.tsx` | 133 | Paleta de comandos global com busca de nav items e histórico no localStorage | EM_USO | COMPLETA |
| `components/ExportDropdown.tsx` | 60 | Botão de exportação com gate de permissão via `useDownloadPermission` | ORFAO | COMPLETA |
| `components/ThemeInitializer.tsx` | 123 | Aplica CSS variables de tema no root do DOM via `useTheme` + presets | EM_USO | COMPLETA |
| `components/ThemeProvider.tsx` | 14 | Wrapper de API-compat — corpo é `<>{children}</>`, sem funcionalidade própria | EM_USO | STUB |
| `components/__tests__/ExportDropdownPermission.test.tsx` | 101 | Testa gate de permissão do `ExportDropdown` | EM_USO | COMPLETA |
| `components/alerts/DegradedConnectionsBanner.tsx` | 157 | Banner realtime de conexões WA degradadas com polling adaptativo | EM_USO | COMPLETA |
| `components/csat/CSATDashboard.tsx` | 124 | Dashboard visual de CSAT (charts, progress bars) via `useCSAT` | EM_USO | COMPLETA |
| `components/errors/ErrorBoundary.tsx` | 325 | Class component de error boundary com telemetria e ChunkLoad retry | EM_USO | COMPLETA |
| `components/errors/__tests__/ErrorBoundary.simulacao.test.tsx` | 303 | Testes de reset, ChunkLoad e telemetria do ErrorBoundary | EM_USO | COMPLETA |
| `components/groups/GroupsView.tsx` | 313 | UI de grupos WhatsApp (lista, cria, edita, filtra por categoria) | EM_USO | COMPLETA |
| `components/groups/__tests__/GroupsView.test.tsx` | 324 | Testes de regressão de GroupsView | EM_USO | COMPLETA |
| `components/keyboard/GlobalKeyboardProvider.tsx` | 160 | Provider global de atalhos; lazy-carrega KeyboardShortcutsDialog e CommandPalette | EM_USO | COMPLETA |
| `components/keyboard/KeyboardShortcutsDialog.tsx` | 247 | Dialog de atalhos customizáveis; carregado lazy por GlobalKeyboardProvider | EM_USO* | COMPLETA |
| `components/knowledge/KnowledgeBaseView.tsx` | 378 | UI de base de conhecimento (artigos + arquivos); upload via storage | EM_USO | COMPLETA |
| `components/leaderboard/Leaderboard.tsx` | 72 | Ranking de agentes; delega a `useLeaderboard` | EM_USO | COMPLETA |
| `components/leaderboard/LeaderboardHelpers.tsx` | 154 | Sub-componentes internos (RankBadge, AchievementBadge, CelebrationParticles, LeaderboardRow) | ORFAO | COMPLETA |
| `components/meta-capi/MetaCAPIView.tsx` | 223 | UI de configuração e log de eventos Meta CAPI | EM_USO | COMPLETA |
| `components/nps/NPSDashboard.tsx` | 210 | Dashboard de NPS; alerta DASHBOARD-04 de edge function sem trigger | EM_USO | PARCIAL |
| `components/payments/PaymentLinksView.tsx` | 325 | CRUD de links de pagamento com realtime `financeiro.payment_links` | EM_USO | COMPLETA |
| `components/providers/AppProviders.tsx` | 157 | Raiz de providers (QueryClient, Auth, Theme, HighContrast, Validation, ErrorBoundary) | EM_USO | COMPLETA |
| `components/providers/ValidationProvider.tsx` | 169 | Context de validação de saúde do app (auth session + DOM); evita probe sem sessão | EM_USO | COMPLETA |
| `components/schedule/ScheduleCalendarView.tsx` | 307 | Calendário mensal de mensagens agendadas; cancel via `useScheduledMessages` | EM_USO | COMPLETA |
| `components/tags/TagsView.tsx` | 301 | CRUD de tags via `useTags` | EM_USO | COMPLETA |
| `components/theme/ChatThemeSettings.tsx` | 105 | Controles de tema do chat (dark/light, font, bubble radius); sem persistência em DB | EM_USO | PARCIAL |
| `components/theme/HighContrastToggle.tsx` | 248 | Provider + Context + Toggle de acessibilidade; persiste em localStorage | EM_USO | COMPLETA |
| `components/transcriptions/TranscriptionContactGroup.tsx` | 118 | Componente puro de exibição — agrupa transcrições por data; sem acesso a DB | ORFAO | COMPLETA |
| `components/transcriptions/TranscriptionsHistoryView.tsx` | 287 | Histórico de transcrições via `dbFrom('messages')` agrupado por contato | EM_USO | COMPLETA |
| `components/wallet/ClientWalletView.tsx` | 137 | CRUD de regras de carteira de clientes (`client_wallet_rules`) | EM_USO | COMPLETA |
| `components/whatsapp-flows/FlowComponentPreview.tsx` | 109 | Renderiza preview de componentes de WA Flow (switch por tipo) | ORFAO | COMPLETA |
| `components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` | 344 | Builder completo de fluxos WA (CRUD, screens, componentes) | EM_USO | COMPLETA |
| `shared/__tests__/criticalPayloadSchemas.test.ts` | 186 | Testes Vitest de `ContractErrorCode` e mapeador de erros | EM_USO | COMPLETA |
| `shared/__tests__/validation.test.ts` | 209 | Testes Vitest dos schemas Zod de validação | EM_USO | COMPLETA |
| `shared/__tests__/webhookEventSchemas.test.ts` | 869 | Testes Vitest dos schemas de eventos de webhook/realtime | EM_USO | COMPLETA |
| `shared/criticalPayloadSchemas.ts` | 90 | `ContractErrorCode` enum + `createCriticalPayloadSchemas()` + mapeador de erros | EM_USO | COMPLETA |
| `shared/validation.ts` | 158 | Schemas Zod para mensagens, contatos, campanhas, Evolution webhooks, retry config | EM_USO | COMPLETA |
| `shared/webhookEventSchemas.ts` | 455 | Schemas Zod para eventos realtime (messages, contacts, conversations, failed_messages, gmail, team-chat) | EM_USO | COMPLETA |

> \* `KeyboardShortcutsDialog` tem zero importadores diretos, mas é carregado via `lazyWithRetry` por `GlobalKeyboardProvider` — EM_USO por import dinâmico.

---

## 2. Fluxos Funcionais

### Infraestrutura Global (providers)
`AppProviders` → `ThemeProvider` (stub) + `HighContrastToggle` (context) + `ValidationProvider` (health check) + `ErrorBoundary` (class component) + `QueryClient` → monta o wrapper raiz do app. `ThemeInitializer` aplica CSS vars via `useTheme` separadamente.

### Atalhos de Teclado
`GlobalKeyboardProvider` → lazy `KeyboardShortcutsDialog` + lazy `CommandPalette` → `useGlobalKeyboardShortcuts` + `audioPlaybackBus`.

### Grupos WhatsApp
`GroupsView` → `useGroupsManager` → `whatsapp_groups`, `whatsapp_connections`.

### Leaderboard / Gamificação
`Leaderboard` → `useLeaderboard` → `useDashboardVisualizationManagement` → `agent_stats`, `profiles`, `queues`, realtime `leaderboard-updates:*`. `LeaderboardHelpers` provê sub-componentes visuais consumidos internamente.

### Base de Conhecimento
`KnowledgeBaseView` → `useKnowledgeBase` → `knowledge_base_articles`, `knowledge_base_files`, storage bucket `whatsapp-media`.

### NPS
`NPSDashboard` → `useNPSSurveys` → `nps_surveys`, `profiles`. Edge function `nps-scheduler` deployada mas sem trigger.

### Pagamentos
`PaymentLinksView` → `usePaymentLinks` → `financeiro.payment_links`, realtime `postgres_changes` no schema `financeiro`.

### Transcrições
`TranscriptionsHistoryView` → `dbFrom('messages')` com filtro `transcription IS NOT NULL`, join `contacts!inner`. `TranscriptionContactGroup` recebe props sem acesso ao DB.

### Meta CAPI
`MetaCAPIView` → `useMetaCapi` → `meta_capi_events`, `global_settings`.

### Agendamentos
`ScheduleCalendarView` → `useScheduledMessages` + `useAgents` (admin).

### WhatsApp Flows
`WhatsAppFlowsBuilder` → `useWhatsAppFlows` → `whatsapp_flows`. `FlowComponentPreview` é sub-componente interno de preview.

### Schemas Compartilhados (src/shared/)
`validation.ts` + `criticalPayloadSchemas.ts` + `webhookEventSchemas.ts` → usados por 10+ edge functions e 5+ hooks de features críticas (inbox, SLA, alertas). `webhookEventSchemas.ts` define `realtimeEnvelopeFor<T>()` consumido em subscriptions realtime.

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

**Tabelas `zapp`:**
- `whatsapp_groups`, `whatsapp_connections` — GroupsView
- `knowledge_base_articles`, `knowledge_base_files` — KnowledgeBaseView
- `meta_capi_events`, `global_settings` — MetaCAPIView
- `nps_surveys`, `profiles` — NPSDashboard, Leaderboard
- `agent_stats`, `queues`, `queue_members`, `goals_configurations` — Leaderboard
- `client_wallet_rules` — ClientWalletView
- `whatsapp_flows` — WhatsAppFlowsBuilder
- `messages` (via `dbFrom`) — TranscriptionsHistoryView
- `feature_flags` — AppProviders (bootstrap)
- `csat_surveys` — CSATDashboard

**Tabelas `financeiro`:**
- `payment_links` — PaymentLinksView (realtime + CRUD)

**Tabelas `evo` (referenciadas em schemas Zod):**
- `evolution_messages`, `evolution_contacts`, `evolution_conversations`, `failed_messages` — webhookEventSchemas.ts (row schemas)

**Tabelas `auth`:**
- `session` — ValidationProvider (health check)

**Storage buckets:**
- `whatsapp-media` — KnowledgeBaseView (upload de arquivos de base de conhecimento)

**Realtime channels:**
- `degraded-banner:<random>` — DegradedConnectionsBanner (schema `zapp`, tabela `whatsapp_connections`)
- `leaderboard-updates:*` — via useDashboardVisualizationManagement
- `payment-links-realtime-<random>` — PaymentLinksView (schema `financeiro`, tabela `payment_links`)

**Edge Functions referenciadas:**
- `nps-scheduler` — documentada em NPSDashboard como deployada mas sem trigger (DASHBOARD-04)
- `evolution-credentials`, `ai-auto-tag`, `webhook-hmac-selftest`, `ai-classify-tickets`, `voice-copilot-action`, `whatsapp-cloud-send`, `public-api`, `promogifts-catalog` — importam `src/shared/validation.ts`
- `supabase/functions/_shared/contract-schemas.ts` — importa `criticalPayloadSchemas.ts` e `webhookEventSchemas.ts`

**RPCs:**
- `check_download_permission` — ExportDropdown via `useDownloadPermission` (intencionalmente ausente, fail-open via SQLSTATE 42883)

---

## 4. Exports Públicos por Categoria

| Categoria | Exports principais |
|-----------|-------------------|
| Providers globais | `AppProviders`, `ValidationProvider`, `ThemeProvider`, `HighContrastToggle` |
| Error handling | `ErrorBoundary` |
| Temas | `ThemeInitializer`, `ChatThemeSettings`, `HighContrastToggle` |
| Navegação/UX | `CommandPalette`, `GlobalKeyboardProvider`, `KeyboardShortcutsDialog` |
| Views de feature | `GroupsView`, `KnowledgeBaseView`, `Leaderboard`, `MetaCAPIView`, `NPSDashboard`, `PaymentLinksView`, `ScheduleCalendarView`, `TagsView`, `TranscriptionsHistoryView`, `ClientWalletView`, `WhatsAppFlowsBuilder` |
| Dashboards inline | `CSATDashboard`, `DegradedConnectionsBanner` |
| Sub-componentes internos | `LeaderboardHelpers`, `TranscriptionContactGroup`, `FlowComponentPreview` |
| Schemas (shared) | `ContractErrorCode`, `createCriticalPayloadSchemas`, `mapValidationIssuesToContractError`, schemas Zod de validação e realtime |

---

## 5. Chama (Saída)

| hook / service / lib | chamado por |
|----------------------|-------------|
| `useDownloadPermission` | ExportDropdown |
| `useTheme` | ThemeInitializer |
| `useCSAT` | CSATDashboard |
| `useGroupsManager` | GroupsView |
| `useGlobalKeyboardShortcuts` | GlobalKeyboardProvider |
| `useCustomShortcuts` | KeyboardShortcutsDialog |
| `useKnowledgeBase` | KnowledgeBaseView |
| `useLeaderboard` / `useDashboardVisualizationManagement` | Leaderboard |
| `useMetaCapi` | MetaCAPIView |
| `useNPSSurveys` | NPSDashboard |
| `usePaymentLinks`, `useMountedRef` | PaymentLinksView |
| `useScheduledMessages`, `useAgents` | ScheduleCalendarView |
| `useTags` | TagsView |
| `useWhatsAppFlows` | WhatsAppFlowsBuilder |
| `useClientWallet` | ClientWalletView |
| `loadFeatureFlags` | AppProviders |
| `lazyWithRetry` | GlobalKeyboardProvider, AppProviders, ErrorBoundary |
| `audioPlaybackBus` | GlobalKeyboardProvider |
| `dbFrom('messages')` | TranscriptionsHistoryView |
| `safeWhatsAppConnectionsQuery` | DegradedConnectionsBanner |
| `@/lib/clientTelemetry`, `@/lib/logger` | ErrorBoundary |
| `@/utils/validationLogger` | ValidationProvider |
| `framer-motion`, `lucide-react`, `sonner` | múltiplos componentes |
| `next-themes` (useTheme) | ChatThemeSettings |
| `date-fns`, `date-fns/locale/ptBR` | ScheduleCalendarView, TranscriptionContactGroup |
| `zod` | shared/validation.ts, shared/criticalPayloadSchemas.ts, shared/webhookEventSchemas.ts |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa (fora do próprio diretório) | importadores |
|---------|------------------------------------------|--------------|
| `CommandPalette.tsx` | `layout/IndexContentConnected.tsx`, `ui/command-palette.tsx`, `keyboard/GlobalKeyboardProvider.tsx` | 3 |
| `ExportDropdown.tsx` | apenas `__tests__/ExportDropdownPermission.test.tsx` (mesmo dir) | 0 externos |
| `ThemeInitializer.tsx` | `App.tsx`, `layout/IndexContentConnected.tsx` | 2+ |
| `ThemeProvider.tsx` | `App.tsx`, `main.tsx`, `components/providers/AppProviders.tsx` e outros | 3+ |
| `DegradedConnectionsBanner.tsx` | `dashboard/DashboardView.tsx` | 1 |
| `CSATDashboard.tsx` | `dashboard/DashboardView.tsx` | 1 |
| `ErrorBoundary.tsx` | `App.tsx`, `lib/lazyWithRetry.ts`, `lib/sentry.ts`, `features/inbox/*`, `components/reports/`, `components/ui/section-error-boundary.tsx` e outros | 34+ |
| `GroupsView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `GlobalKeyboardProvider.tsx` | `App.tsx`, `hooks/useIndexNavigation.ts` | 2 |
| `KeyboardShortcutsDialog.tsx` | zero diretos; carregado via `lazyWithRetry` em `GlobalKeyboardProvider.tsx` | 0 diretos |
| `KnowledgeBaseView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `Leaderboard.tsx` | `dashboard/DashboardWidgetRenderer.tsx`, `hooks/useLeaderboard.ts`, `i18n/index.ts`, `docs/featuresSectionsData.ts` | 4+ |
| `LeaderboardHelpers.tsx` | `leaderboard/Leaderboard.tsx` (mesmo dir) | 0 externos |
| `MetaCAPIView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx`, `hooks/meta-capi/useMetaCapi.ts` | 3 |
| `NPSDashboard.tsx` | `settings/SettingsView.tsx`, `pages/ViewRouter.tsx`, `pages/lazyViews.ts` | 3 |
| `PaymentLinksView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `AppProviders.tsx` | `App.tsx` e outros bootstrap files | 2+ |
| `ValidationProvider.tsx` | `providers/AppProviders.tsx`, `debug/BuildValidationOverlay.tsx` | 2 |
| `ScheduleCalendarView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `TagsView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `ChatThemeSettings.tsx` | `settings/AppearanceSettings.tsx` | 1 |
| `HighContrastToggle.tsx` | `providers/AppProviders.tsx` | 1 |
| `TranscriptionContactGroup.tsx` | `transcriptions/TranscriptionsHistoryView.tsx` (mesmo dir) | 0 externos |
| `TranscriptionsHistoryView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `ClientWalletView.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `FlowComponentPreview.tsx` | `whatsapp-flows/WhatsAppFlowsBuilder.tsx` (mesmo dir) | 0 externos |
| `WhatsAppFlowsBuilder.tsx` | `pages/lazyViews.ts`, `pages/ViewRouter.tsx` | 2 |
| `criticalPayloadSchemas.ts` | `features/inbox/hooks/useNewConversation.ts`, `features/sla/hooks/useSLANotifications.ts`, `integrations/zappweb/hooks/useZappMessages.ts`, `features/inbox/components/TicketHistorySheet.tsx`, `hooks/useAlertManagement.ts`, `supabase/functions/_shared/contract-schemas.ts` | 6 |
| `webhookEventSchemas.ts` | mesmos 6 de `criticalPayloadSchemas.ts` | 6 |
| `validation.ts` | 10+ edge functions (`evolution-credentials`, `ai-auto-tag`, `webhook-hmac-selftest`, `whatsapp-cloud-send`, `public-api` etc.) | 10+ |

---

## 7. Órfãos

Lista fechada de arquivos com zero importadores fora do próprio diretório:

| arquivo | linhas | veredito | justificativa |
|---------|--------|----------|---------------|
| `ExportDropdown.tsx` | 60 | VERIFICAR | Apenas o arquivo de teste o importa; nenhum uso em código de produção encontrado. Possível substituição por outro componente de exportação. Depende de RPC ausente (`check_download_permission`) com fail-open intencional. |
| `LeaderboardHelpers.tsx` | 154 | SEGURO | Sub-componentes visuais puros (RankBadge, AchievementBadge, CelebrationParticles, LeaderboardRow) usados exclusivamente por `Leaderboard.tsx` no mesmo diretório. Separação por tamanho de arquivo, não redundância. |
| `TranscriptionContactGroup.tsx` | 118 | SEGURO | Componente puro de UI sem acesso a DB; usado exclusivamente por `TranscriptionsHistoryView.tsx` no mesmo diretório. Separação justificada por separação de apresentação/container. |
| `FlowComponentPreview.tsx` | 109 | SEGURO | Preview de sub-componente de WA Flow; usado exclusivamente por `WhatsAppFlowsBuilder.tsx` no mesmo diretório. Separação intencional de builder e preview. |
| `KeyboardShortcutsDialog.tsx` | 247 | NAO_REMOVER | Zero importadores **diretos**, mas carregado dinamicamente via `lazyWithRetry` em `GlobalKeyboardProvider.tsx`. Grep convencional não o detecta. Em uso real em produção. |

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| `CommandPalette.tsx` | COMPLETA | — |
| `ExportDropdown.tsx` | COMPLETA | Nenhum importador de produção; confirmar se foi substituído |
| `ThemeInitializer.tsx` | COMPLETA | — |
| `ThemeProvider.tsx` | STUB | Corpo é `<>{children}</>`; props `defaultTheme`/`storageKey` são ignoradas silenciosamente |
| `__tests__/ExportDropdownPermission.test.tsx` | COMPLETA | — |
| `alerts/DegradedConnectionsBanner.tsx` | COMPLETA | — |
| `csat/CSATDashboard.tsx` | COMPLETA | — |
| `errors/ErrorBoundary.tsx` | COMPLETA | — |
| `errors/__tests__/ErrorBoundary.simulacao.test.tsx` | COMPLETA | — |
| `groups/GroupsView.tsx` | COMPLETA | — |
| `groups/__tests__/GroupsView.test.tsx` | COMPLETA | — |
| `keyboard/GlobalKeyboardProvider.tsx` | COMPLETA | — |
| `keyboard/KeyboardShortcutsDialog.tsx` | COMPLETA | — |
| `knowledge/KnowledgeBaseView.tsx` | COMPLETA | — |
| `leaderboard/Leaderboard.tsx` | COMPLETA | — |
| `leaderboard/LeaderboardHelpers.tsx` | COMPLETA | — |
| `meta-capi/MetaCAPIView.tsx` | COMPLETA | — |
| `nps/NPSDashboard.tsx` | PARCIAL | Edge function `nps-scheduler` deployada sem trigger (sem pg_cron, sem invoke no front) — DASHBOARD-04 |
| `payments/PaymentLinksView.tsx` | COMPLETA | Confirmar se `financeiro.payment_links` está na publication `supabase_realtime` |
| `providers/AppProviders.tsx` | COMPLETA | — |
| `providers/ValidationProvider.tsx` | COMPLETA | — |
| `schedule/ScheduleCalendarView.tsx` | COMPLETA | — |
| `tags/TagsView.tsx` | COMPLETA | — |
| `theme/ChatThemeSettings.tsx` | PARCIAL | Sem persistência: CSS vars aplicadas em `document.documentElement` se perdem no refresh |
| `theme/HighContrastToggle.tsx` | COMPLETA | Persistência somente em localStorage, não sincronizada com DB |
| `transcriptions/TranscriptionContactGroup.tsx` | COMPLETA | — |
| `transcriptions/TranscriptionsHistoryView.tsx` | COMPLETA | Join `contacts!inner` pode ocultar mensagens sem contato associado |
| `wallet/ClientWalletView.tsx` | COMPLETA | — |
| `whatsapp-flows/FlowComponentPreview.tsx` | COMPLETA | — |
| `whatsapp-flows/WhatsAppFlowsBuilder.tsx` | COMPLETA | Confirmar origem do CREATE TABLE de `whatsapp_flows` (não encontrado no squash) |
| `shared/__tests__/criticalPayloadSchemas.test.ts` | COMPLETA | Import morto de `https://deno.land/std@0.224.0/assert/mod.ts` na linha 4 |
| `shared/__tests__/validation.test.ts` | COMPLETA | — |
| `shared/__tests__/webhookEventSchemas.test.ts` | COMPLETA | — |
| `shared/criticalPayloadSchemas.ts` | COMPLETA | — |
| `shared/validation.ts` | COMPLETA | — |
| `shared/webhookEventSchemas.ts` | COMPLETA | Campo `table: z.string()` sem whitelist — qualquer string passa |

---

## 9. Achados

### A1 — ThemeProvider é um stub silencioso
`components/ThemeProvider.tsx:12` — corpo é literalmente `<>{children}</>`. Qualquer código que passe props `defaultTheme` ou `storageKey` as silencia sem aviso. Wrapper existe apenas para compatibilidade de API com código legado ou Lovable-origin.

### A2 — ExportDropdown sem uso em produção
`components/ExportDropdown.tsx` — nenhum importador fora do arquivo de teste. Depende de `check_download_permission` que é intencionalmente ausente (fail-open via SQLSTATE 42883). Se nenhuma tela chama este componente, está morto funcionalmente e ocupa espaço de biblioteca.

### A3 — NPSDashboard: edge function `nps-scheduler` sem trigger
`components/nps/NPSDashboard.tsx:12–25` — documenta no próprio componente que a edge function `nps-scheduler` está deployada mas não tem pg_cron nem invoke no front. O componente emite alerta DASHBOARD-04 visível na UI. NPS automático não funciona até criação de trigger ou cron job.

### A4 — ChatThemeSettings usa `next-themes` com ThemeProvider próprio
`components/theme/ChatThemeSettings.tsx:20–22` — usa `useTheme` de `next-themes` enquanto o projeto tem `ThemeProvider` próprio em `@/components/ThemeProvider`. Risco de conflito de context se ambos coexistem na árvore. Além disso, CSS vars aplicadas sem persistência se perdem no refresh.

### A5 — PaymentLinksView com realtime fora do schema `zapp`/`evo`
`components/payments/PaymentLinksView.tsx:60–61` — canal realtime aponta para schema `financeiro`, tabela `payment_links`. Verificar se essa tabela está na publication `supabase_realtime` (documentação do projeto só lista schemas `zapp` e `evo` como garantidos).

### A6 — DegradedConnectionsBanner: canal realtime com nome aleatório
`components/alerts/DegradedConnectionsBanner.tsx:59` — canal criado com sufixo aleatório a cada mount. Se o componente for remontado frequentemente, canais zumbi podem acumular até o cleanup do `removeChannel`.

### A7 — Import morto Deno em teste Vitest
`shared/__tests__/criticalPayloadSchemas.test.ts:4` — linha com `import ... from 'https://deno.land/std@0.224.0/assert/mod.ts'` dentro de arquivo Vitest. Linha aparentemente inativa, mas é um import morto que pode causar falha em runners não-Deno ou alertas de linter.

### A8 — webhookEventSchemas sem whitelist de tabela
`shared/webhookEventSchemas.ts` — `realtimeEnvelopeFor<T>()` define `table: z.string()` sem validar o nome contra enum. Qualquer string passa, o que pode mascarar subscriptions com nome de tabela errado em produção (ex: `evolution_messages_wpp2` em vez de `evolution_messages`).

### A9 — TranscriptionsHistoryView: join inner pode ocultar dados
`components/transcriptions/TranscriptionsHistoryView.tsx:58–63` — `dbFrom('messages')` usa `contacts!inner`. Se a mensagem não tiver contato associado, é silenciosamente omitida. Ausência de dados pode ser confundida com bug de produto.

### A10 — KnowledgeBaseView usa bucket `whatsapp-media` para base de conhecimento
`components/knowledge/KnowledgeBaseView.tsx` — arquivos de base de conhecimento são salvos no bucket `whatsapp-media` (confirmado via `useKnowledgeBase`). Nome do bucket é enganoso para esse caso de uso e pode dificultar gestão de storage e ACL.

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
