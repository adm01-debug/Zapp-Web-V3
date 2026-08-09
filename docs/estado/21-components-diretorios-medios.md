# Estado: Components — Diretórios Médios (docs, automations, system, performance, omnichannel, gmail, effects, debug, compliance, chatbot, campaigns, routing, pipeline, diagnostics, agents)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 58/58

## 1. Visao Geral

15 diretórios médios de `src/components/`. Todos os 33 arquivos não-teste têm pelo menos um importador conhecido; os 18 orfãos abaixo são sub-componentes ou utilitários restritos ao próprio módulo — nenhum é código morto.

### Tabela de Arquivos

| arquivo | linhas | o que faz | status | impl | o que falta |
|---------|--------|-----------|--------|------|-------------|
| agents/AgentsView.tsx | 291 | Lista agentes com stats, busca, filtro, avatar; abre dialogs | EM_USO | COMPLETA | — |
| agents/ConfigurePermissionsDialog.tsx | 116 | Exibe roles/permissões via `useTeamPermissions` | ORFAO | COMPLETA | — |
| agents/InviteAgentDialog.tsx | 144 | Convida agente por e-mail via EF `send-email` | ORFAO | COMPLETA | magic link/token de registro ausente |
| automations/AutomationCard.tsx | 70 | Card de automação com toggle/editar/deletar/duplicar | ORFAO | COMPLETA | — |
| automations/AutomationEditorDialog.tsx | 166 | Dialog criar/editar automação; 1 ação única; salva via callback | ORFAO | PARCIAL | suporte a múltiplas ações; persistência de `trigger_config` |
| automations/AutomationsManager.tsx | 115 | CRUD de automações via `useAutomationsManagementCRUD` | EM_USO | COMPLETA | — |
| automations/automationConstants.ts | 19 | `TRIGGER_TYPES` (5) e `ACTION_TYPES` (5) | ORFAO | COMPLETA | — |
| automations/__tests__/automationConstants.test.ts | 104 | Testes vitest dos tipos/constantes | TESTE | COMPLETA | — |
| campaigns/CampaignABTesting.tsx | 175 | Variantes A/B; adicionar/deletar/declarar vencedor | ORFAO | COMPLETA | — |
| campaigns/CampaignCreateDialog.tsx | 278 | Wizard criar campanha; seleciona contatos por tag/fila/grupos | EM_USO | COMPLETA | campo `scheduled_at` ausente no formulário |
| campaigns/CampaignsView.tsx | 334 | Tela principal de campanhas; CRUD, filtro, preview, A/B lazy | EM_USO | COMPLETA | — |
| campaigns/__tests__/CampaignsView.test.tsx | 83 | Testes vitest da tela CampaignsView | TESTE | COMPLETA | — |
| chatbot/ChatbotExecutionsDashboard.tsx | 233 | Lista execuções de chatbot com filtro por status | ORFAO | COMPLETA | — |
| chatbot/ChatbotFlowEditor.tsx | 141 | Editor visual de nós/arestas de um fluxo; salva via callback | ORFAO | COMPLETA | — |
| chatbot/ChatbotFlowsView.tsx | 330 | CRUD de fluxos + aba execuções lazy; rota principal chatbot | EM_USO | COMPLETA | — |
| chatbot/ChatbotNodeDialogs.tsx | 103 | Exporta `nodeTypes`, `AddNodeDialog`, `EditNodeDialog` | ORFAO | COMPLETA | — |
| compliance/LGPDComplianceView.tsx | 289 | Tela LGPD: exportação bloqueada, exclusão de dados, RPC audit | EM_USO | COMPLETA | — |
| compliance/PrivacyAuditTrail.tsx | 96 | Exibe audit log via `useLGPDAuditLogs` | ORFAO | COMPLETA | — |
| compliance/PrivacyPolicySection.tsx | 86 | Texto estático da política de privacidade (10 seções) | ORFAO | COMPLETA | — |
| compliance/WhatsAppComplianceGuide.tsx | 95 | Guia estático LGPD × WhatsApp | ORFAO | COMPLETA | — |
| debug/BuildValidationOverlay.tsx | 134 | Overlay de validação de build; ativável via `?debug=true` | EM_USO | COMPLETA | remover guard por query string |
| debug/HardResetButton.tsx | 55 | Botão dev: desregistra SW, limpa caches; guard `import.meta.env.DEV` | EM_USO | COMPLETA | — |
| debug/SwDebugWidget.tsx | 252 | Widget SW debug: opt-in por URL/localStorage/dataset | EM_USO | COMPLETA | — |
| debug/ThemeDebugger.tsx | 128 | Inspetor de tokens CSS; guard role `dev` no banco | EM_USO | COMPLETA | — |
| diagnostics/ConnectionHealthPanel.tsx | 359 | Painel saúde conexões WA; lista conexões, logs, Realtime INSERT | EM_USO | COMPLETA | — |
| diagnostics/DiagnosticsView.tsx | 333 | View de diagnóstico (conexões, logs, métricas); tabs | EM_USO | COMPLETA | — |
| diagnostics/__tests__/ConnectionHealthPanel.test.tsx | 100 | Testes unitários do painel de saúde | TESTE | COMPLETA | — |
| docs/FontUsageGuide.tsx | 108 | Guia estático de fontes (Inter vs JetBrains Mono) | EM_USO | COMPLETA | — |
| docs/SystemFeaturesView.tsx | 107 | Lista 34 features do sistema com busca e expansão | EM_USO | COMPLETA | — |
| docs/TypographyGuide.tsx | 75 | Guia tipográfico estático | EM_USO | COMPLETA | — |
| docs/__tests__/featuresSectionsData.test.ts | 162 | Testes da estrutura de dados das seções de features | TESTE | COMPLETA | — |
| docs/featuresSectionsData.ts | 377 | Dados 34 seções + `totalFeatures`; usado por SystemFeaturesView e EasterEggs | EM_USO | COMPLETA | — |
| effects/AuroraBorealis.tsx | 162 | Efeito visual de aurora boreal animado (framer-motion) | EM_USO | COMPLETA | — |
| effects/Confetti.tsx | 301 | `Confetti` + `CelebrationOverlay` + hook `useCelebration` | EM_USO | COMPLETA | — |
| effects/EasterEggs.tsx | 381 | Konami code, secret codes, shake detection, matrix/party mode | EM_USO | COMPLETA | — |
| effects/ParallaxContainer.tsx | 258 | `ParallaxContainer` + `ParallaxImage` com scroll-driven animation | EM_USO | COMPLETA | — |
| gmail/GmailAccountSelector.tsx | 191 | Dropdown seletor de contas Gmail com status de token | EM_USO | COMPLETA | — |
| gmail/GmailInboxView.tsx | 315 | Listagem de threads de e-mail com filtro/busca e SLA badges | EM_USO | COMPLETA | — |
| gmail/GmailLabelSidebar.tsx | 168 | Sidebar de labels do Gmail (built-in + customizados) | ORFAO | COMPLETA | — |
| gmail/GmailStatusPanel.tsx | 147 | Painel de saúde do e-mail (schema/RPC telemetria) | EM_USO | COMPLETA | — |
| omnichannel/ChannelRoutingRules.tsx | 118 | CRUD de regras de roteamento por canal → fila | ORFAO | COMPLETA | — |
| omnichannel/OmnichannelInbox.tsx | 324 | Inbox unificada multi-canal (WA + email + etc.) | EM_USO | COMPLETA | — |
| omnichannel/OmnichannelManager.tsx | 224 | Gerência de canais omnichannel (add/delete/routing) | EM_USO | COMPLETA | — |
| omnichannel/__tests__/OmnichannelInbox.test.tsx | 217 | Testes de regressão para OmnichannelInbox | TESTE | COMPLETA | — |
| performance/PerformanceMonitor.tsx | 467 | Coleta métricas browser (FCP, TTFB, memória) e persiste no DB | EM_USO | COMPLETA | — |
| performance/__tests__/PerformanceMonitor.test.tsx | 332 | Testes para PerformanceMonitor | TESTE | COMPLETA | — |
| performance/__tests__/classifyMetricStatus.test.ts | 79 | Testes unitários para classifyMetricStatus | TESTE | COMPLETA | — |
| performance/classifyMetricStatus.ts | 19 | Função pura: classifica valor numérico em good/warning/critical | ORFAO | COMPLETA | — |
| pipeline/DealCard.tsx | 92 | Card de deal arrastável com ações (editar, ganho, perdido, excluir) | EM_USO | COMPLETA | — |
| pipeline/PipelineKPICards.tsx | 34 | 4 KPI cards (pipeline total, deals ativos, ganhos, taxa conversão) | ORFAO | COMPLETA | — |
| pipeline/SalesPipelineView.tsx | 101 | Kanban de pipeline com drag-and-drop entre estágios | EM_USO | COMPLETA | — |
| routing/AdminRoutes.tsx | 291 | Função `adminRoutes()` — rotas `/admin/*` com lazy + ProtectedRoute | ORFAO | COMPLETA | — |
| routing/AppRoutes.tsx | 181 | Componente raiz `<Routes>` — inclui admin+debug routes, Suspense | EM_USO | COMPLETA | — |
| routing/DebugRoutes.tsx | 53 | Função `debugRoutes()` — rotas `/debug/*` com guard admin/dev | ORFAO | COMPLETA | — |
| system/AutomationFailureAlertsMount.tsx | 12 | Headless — toasts de falha de automação via hook | EM_USO | COMPLETA | — |
| system/FailedMessageAlertsMount.tsx | 18 | Headless — alertas DLQ e retry-resolution | EM_USO | COMPLETA | — |
| system/IntegrationMigrationMount.tsx | 47 | Headless — chama `rpc_migrate_whatsapp_integration` 1×/sessão | EM_USO | COMPLETA | — |
| system/ServiceWorkerUpdateBanner.tsx | 134 | Banner de atualização de bundle; escuta eventos `sw-update-available` | EM_USO | COMPLETA | — |

---

## 2. Fluxos funcionais

### Agents
`AgentsView` → `useAgents` (features/admin) → `zapp.profiles`, `zapp.user_roles`, `zapp.agent_presence`
Dialogs: `ConfigurePermissionsDialog` (via `useTeamPermissions`), `InviteAgentDialog` → EF `send-email`

### Automations
`AutomationsManager` → `useAutomationsManagementCRUD` → `zapp.automation_rules` (CRUD) + RPCs `rpc_register_automation_execution` / `rpc_record_automation_error`

### Campaigns
`CampaignsView` → `useCampaigns` → `zapp.campaigns` (read/insert) + RPC `add_contacts_to_campaign` → `zapp.campaign_contacts`

### Chatbot
`ChatbotFlowsView` → `useChatbotFlows` → `chatbot_flows` (CRUD) + `chatbot_executions` (via dashboard lazy)

### Compliance
`LGPDComplianceView` → RPC `log_audit_event` → `zapp.audit_logs`; `createDataDeletionRequest` → `zapp.data_deletion_requests`

### Debug (todos montados em App.tsx)
`BuildValidationOverlay` (ValidationProvider), `HardResetButton` (tree-shaken em prod), `SwDebugWidget` (opt-in localStorage/URL), `ThemeDebugger` (role `dev` no banco)

### Diagnostics
`DiagnosticsView` → `ConnectionHealthPanel` → Realtime INSERT em `zapp.connection_health_logs` + EF `connection-health-check`

### Docs + Effects
Views estáticas de documentação: `FontUsageGuide`, `TypographyGuide`, `SystemFeaturesView` (dados de `featuresSectionsData.ts`)
`EasterEggs` (App.tsx lazy) consome `featuresSectionsData` e `useCelebration` de `Confetti`

### Gmail
`GmailInboxView` → `useEmailManagement` → `email_app.email_threads`, `email_app.email_accounts`
`GmailLabelSidebar` → `useGmailLabels` → `email_app.email_labels`
`GmailStatusPanel` → `useGmailHealth` (RPCs telemetria); consumido por `DiagnosticsView`

### Omnichannel
`OmnichannelInbox` → `useChannelConnections` + `dbFrom('contacts')` → `zapp.contacts`
`OmnichannelManager` → `useOmnichannelChannels`; lazy-carrega `ChannelRoutingRules` → `useChannelRoutingRules` → `zapp.channel_connections`, `zapp.channel_routing_rules`, `zapp.queues`

### Performance
`PerformanceMonitor` → `usePerformanceSnapshots` → `zapp.performance_snapshots` (INSERT + SELECT); coleta FCP, TTFB, memória, cache hit rate via Web Performance API

### Pipeline
`SalesPipelineView` → `useSalesPipeline` (re-export de `useBusinessLogicPipelineManagement`) → `zapp.sales_pipeline_stages`, `zapp.sales_deals`, `zapp.contacts`, `zapp.profiles`

### Routing
`App.tsx` → `AppRoutes` → `adminRoutes()` (`AdminRoutes`) + `debugRoutes()` (`DebugRoutes`) com lazy + Suspense

### System mounts (todos em AppShell.tsx / App.tsx)
- `AutomationFailureAlertsMount` → `useAutomationFailureAlerts` → Realtime `automation_rule_executions`
- `FailedMessageAlertsMount` → `useFailedMessageAlerts` / `useRetryResolutionAlerts` → Realtime `zapp.failed_messages`, `zapp.dispatch_error_logs`
- `IntegrationMigrationMount` → RPC `rpc_migrate_whatsapp_integration` (1× por sessão, sessionStorage guard)
- `ServiceWorkerUpdateBanner` → escuta eventos DOM `sw-update-available` e `zapp-update-required`

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas (`zapp` salvo indicação)
`automation_rules`, `automation_executions`, `campaigns`, `campaign_contacts`, `channel_connections`, `channel_routing_rules`, `chatbot_executions`, `chatbot_flows`, `connection_health_logs`, `contacts`, `data_deletion_requests`, `performance_snapshots`, `profiles`, `queues`, `sales_deals`, `sales_pipeline_stages`, `user_roles`, `agent_presence`, `audit_logs`, `failed_messages`, `dispatch_error_logs`, `automation_rule_executions`

**Schema `email_app`:** `email_threads`, `email_accounts`, `email_labels`

### RPCs
`add_contacts_to_campaign`, `log_audit_event`, `rpc_migrate_whatsapp_integration`, `rpc_register_automation_execution`, `rpc_record_automation_error`, `rpc_list_messages`, `rpc_get_contact`, `rpc_upsert_contact`

### Canais Realtime
| canal | schema | tabela | evento | quem escuta |
|-------|--------|--------|--------|-------------|
| connection_health_logs | zapp | connection_health_logs | INSERT | ConnectionHealthPanel |
| automation failures | zapp | automation_rule_executions | INSERT | AutomationFailureAlertsMount |
| DLQ alerts | zapp | failed_messages | INSERT | FailedMessageAlertsMount |
| dispatch errors | zapp | dispatch_error_logs | INSERT | FailedMessageAlertsMount |

### Edge Functions
`send-email` (InviteAgentDialog), `connection-health-check` (ConnectionHealthPanel)

---

## 4. Exports Públicos por categoria

| categoria | exports |
|-----------|---------|
| Views (rota direta) | `AgentsView`, `AutomationsManager`, `CampaignsView`, `ChatbotFlowsView`, `LGPDComplianceView`, `DiagnosticsView`, `SystemFeaturesView`, `GmailInboxView`, `OmnichannelInbox`, `OmnichannelManager`, `PerformanceMonitor`, `SalesPipelineView` |
| Sub-components / Dialogs | `ConfigurePermissionsDialog`, `InviteAgentDialog`, `AutomationCard`, `AutomationEditorDialog`, `CampaignABTesting`, `CampaignCreateDialog`, `ChatbotFlowEditor`, `ChatbotNodeDialogs` (+ `nodeTypes`), `PrivacyPolicySection`, `PrivacyAuditTrail`, `WhatsAppComplianceGuide`, `GmailAccountSelector`, `GmailLabelSidebar`, `GmailStatusPanel`, `ChannelRoutingRules`, `ConnectionHealthPanel`, `DealCard`, `PipelineKPICards`, `FontUsageGuide`, `TypographyGuide`, `ServiceWorkerUpdateBanner` |
| Debug tools | `BuildValidationOverlay`, `HardResetButton`, `SwDebugWidget`, `ThemeDebugger` |
| System mounts (headless) | `AutomationFailureAlertsMount`, `FailedMessageAlertsMount`, `IntegrationMigrationMount` |
| Effects / Animações | `AuroraBorealis`, `Confetti` (+ `CelebrationOverlay`), `EasterEggs`, `ParallaxContainer`, `ParallaxImage` |
| Hooks exportados | `useCelebration` (Confetti) |
| Routing infra | `AppRoutes`, `adminRoutes()`, `debugRoutes()` |
| Dados / Utilitários | `TRIGGER_TYPES`, `ACTION_TYPES` (automationConstants), `classifyMetricStatus`, `featuresSectionsData` |

---

## 5. Chama (Saída)

| hook / serviço / lib | usado por |
|---------------------|-----------|
| `@/features/admin` → `useAgents`, `useDiagnosticsData` | AgentsView, DiagnosticsView |
| `@/hooks/useTeamPermissions` | ConfigurePermissionsDialog |
| `@/hooks/useAutomationManagement` | AutomationsManager, AutomationCard, AutomationEditorDialog |
| `@/hooks/useCampaigns` | CampaignsView, CampaignCreateDialog |
| `@/hooks/campaigns/useCampaignABTesting` | CampaignABTesting |
| `@/hooks/useChatbotFlows` | ChatbotFlowsView, ChatbotFlowEditor |
| `@/hooks/useLGPDAuditLogs` | PrivacyAuditTrail |
| `@/features/contacts/services/dataDeletionRequestService` | LGPDComplianceView |
| `@/hooks/useConnectionHealthLogs` | ConnectionHealthPanel |
| `@/hooks/useEmailManagement`, `useGmailOAuthFlow`, `useGmailLabels`, `useGmailHealth` | Gmail components |
| `@/hooks/omnichannel/useOmnichannelChannels`, `useChannelRoutingRules` | OmnichannelManager, ChannelRoutingRules |
| `@/integrations/datasource/db` (`dbFrom`) | OmnichannelInbox |
| `@/hooks/usePerformanceMonitoring` | PerformanceMonitor |
| `@/hooks/pipeline/useSalesPipeline` | SalesPipelineView |
| `@/hooks/useAutomationFailureAlerts`, `useFailedMessageAlerts`, `useRetryResolutionAlerts` | system/ mounts |
| `@/lib/whatsappAdapter`, `@/integrations/supabase/safeClient` | IntegrationMigrationMount |
| `@/features/auth:ProtectedRoute` | AdminRoutes, DebugRoutes |
| `framer-motion` | ConnectionHealthPanel, ChatbotFlowEditor, DiagnosticsView, SystemFeaturesView, AuroraBorealis, Confetti, EasterEggs, ParallaxContainer, SalesPipelineView, DealCard |
| `@tanstack/react-query` | ChatbotExecutionsDashboard |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | contagem |
|---------|-------------|---------|
| agents/AgentsView.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| automations/AutomationsManager.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| campaigns/CampaignCreateDialog.tsx | CampaignsView.tsx, useCampaigns.ts | 2 |
| campaigns/CampaignsView.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| chatbot/ChatbotFlowsView.tsx | lazyViews.ts | 1 |
| compliance/LGPDComplianceView.tsx | lazyViews.ts | 1 |
| debug/BuildValidationOverlay.tsx | App.tsx (lazy) | 1 |
| debug/HardResetButton.tsx | App.tsx (lazy) | 1 |
| debug/SwDebugWidget.tsx | App.tsx (lazy) | 1 |
| debug/ThemeDebugger.tsx | App.tsx (lazy) | 1 |
| diagnostics/ConnectionHealthPanel.tsx | lazyViews.ts, DiagnosticsView.tsx | 2 |
| diagnostics/DiagnosticsView.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| docs/FontUsageGuide.tsx | DesignSystem.tsx | 1 |
| docs/SystemFeaturesView.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| docs/TypographyGuide.tsx | DesignSystem.tsx | 1 |
| docs/featuresSectionsData.ts | SystemFeaturesView.tsx, EasterEggs.tsx | 2 |
| effects/AuroraBorealis.tsx | DashboardView.tsx, TranscriptionsHistoryView.tsx, SLAHistory.tsx | 3+ |
| effects/Confetti.tsx | AchievementsSystem.tsx, TagsView.tsx, QueuesView.tsx, AgentsView.tsx, DashboardView.tsx + 9 outros | 14+ |
| effects/EasterEggs.tsx | App.tsx (lazy) | 1 |
| effects/ParallaxContainer.tsx | DashboardView.tsx, QueueDetails.tsx, QueuesComparison.tsx + outros | 3+ |
| gmail/GmailAccountSelector.tsx | EmailChatInbox.tsx | 1 |
| gmail/GmailInboxView.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| gmail/GmailStatusPanel.tsx | DiagnosticsView.tsx | 1 |
| omnichannel/OmnichannelInbox.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| omnichannel/OmnichannelManager.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| performance/PerformanceMonitor.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| pipeline/DealCard.tsx | SalesPipelineView.tsx, useBusinessLogicManagement.ts | 2 |
| pipeline/SalesPipelineView.tsx | lazyViews.ts, ViewRouter.tsx | 2 |
| routing/AppRoutes.tsx | App.tsx | 1 |
| system/AutomationFailureAlertsMount.tsx | AppShell.tsx | 1 |
| system/FailedMessageAlertsMount.tsx | AppShell.tsx | 1 |
| system/IntegrationMigrationMount.tsx | AppShell.tsx | 1 |
| system/ServiceWorkerUpdateBanner.tsx | App.tsx | 1 |

---

## 7. Orfaos

Todos os 18 orfãos abaixo são **sub-componentes ou utilitários restritos ao próprio módulo** — usados pela view-raiz do diretório, sem necessidade de ser importáveis de fora.

| arquivo | tamanho | veredito | razão |
|---------|---------|----------|-------|
| agents/ConfigurePermissionsDialog.tsx | 116 l | SEGURO | Sub-dialog de AgentsView |
| agents/InviteAgentDialog.tsx | 144 l | SEGURO | Sub-dialog de AgentsView |
| automations/AutomationCard.tsx | 70 l | SEGURO | Sub-componente de AutomationsManager |
| automations/AutomationEditorDialog.tsx | 166 l | SEGURO | Sub-dialog de AutomationsManager |
| automations/automationConstants.ts | 19 l | SEGURO | Constantes do módulo; bem testadas |
| campaigns/CampaignABTesting.tsx | 175 l | SEGURO | Lazy-loaded por CampaignsView |
| chatbot/ChatbotFlowEditor.tsx | 141 l | SEGURO | Usado por ChatbotFlowsView |
| chatbot/ChatbotExecutionsDashboard.tsx | 233 l | SEGURO | Lazy-loaded por ChatbotFlowsView |
| chatbot/ChatbotNodeDialogs.tsx | 103 l | SEGURO | Usado por ChatbotFlowEditor |
| compliance/PrivacyAuditTrail.tsx | 96 l | SEGURO | Sub-componente de LGPDComplianceView |
| compliance/PrivacyPolicySection.tsx | 86 l | SEGURO | Sub-componente de LGPDComplianceView |
| compliance/WhatsAppComplianceGuide.tsx | 95 l | SEGURO | Sub-componente de LGPDComplianceView |
| gmail/GmailLabelSidebar.tsx | 168 l | SEGURO | Usado por GmailInboxView |
| omnichannel/ChannelRoutingRules.tsx | 118 l | VERIFICAR | Lazy por OmnichannelManager; AdminQueuesPage.tsx tem referência em comentário (não import real) |
| performance/classifyMetricStatus.ts | 19 l | SEGURO | Função pura com 79 linhas de teste; extração correta |
| pipeline/PipelineKPICards.tsx | 34 l | SEGURO | Sub-componente de SalesPipelineView |
| routing/AdminRoutes.tsx | 291 l | NAO_REMOVER | Infraestrutura de rotas; exporta função (não componente) usada por AppRoutes |
| routing/DebugRoutes.tsx | 53 l | NAO_REMOVER | Infraestrutura de rotas `/debug/*`; guard admin/dev |

---

## 8. Implementacao por Arquivo

| arquivo | impl | o que falta |
|---------|------|-------------|
| automations/AutomationEditorDialog.tsx | PARCIAL | suporte a múltiplas ações (`actions[0]` hardcoded); `trigger_config` não é editável/persistido |
| campaigns/CampaignCreateDialog.tsx | COMPLETA | campo `scheduled_at` do banco não exposto no formulário (feature gap, não impl parcial) |
| agents/InviteAgentDialog.tsx | COMPLETA | magic link ausente (limitação de design, não bug de impl) |
| Todos os demais (49 arquivos) | COMPLETA | — |

---

## 9. Achados

### A1 — BuildValidationOverlay ativável em produção via query string
`debug/BuildValidationOverlay.tsx:18` — guard `isDev` aceita `window.location.search.includes('debug=true')` como alternativa a `import.meta.env.DEV`. Qualquer usuário em produção que acesse `?debug=true` vê o overlay com logs internos e status do sistema. Risco: vazamento de informação sensível de build.

### A2 — AutomationEditorDialog: múltiplas ações perdidas silenciosamente ao editar
`automations/AutomationEditorDialog.tsx:42-43` — editor usa `actions[0]` hardcoded. Automações com múltiplas ações (criadas programaticamente) perdem todas exceto a primeira ao passar pelo editor. Sem aviso ao usuário.

### A3 — AutomationEditorDialog: `trigger_config` não persistido
`automations/AutomationEditorDialog.tsx:55-61` — `trigger_config` não é incluído no `handleSave`; campo do banco é sempre sobrescrito com valor anterior (undefined/null).

### A4 — `zapp.campaigns` sem policies UPDATE/DELETE
Referenciado em `useCampaigns.ts` (comentário crítico) — operações Iniciar/Pausar/Cancelar campanha provavelmente falham por RLS. Afeta `CampaignsView` e `CampaignCreateDialog`.

### A5 — InviteAgentDialog envia e-mail sem magic link/token de registro
`agents/InviteAgentDialog.tsx:45-60` — convite envia HTML genérico via EF `send-email` sem link de criação de conta. Agente convidado não consegue criar acesso diretamente pelo e-mail recebido.

### A6 — CampaignCreateDialog: campo `scheduled_at` ausente
`campaigns/CampaignCreateDialog.tsx:52` — `scheduled_at` existe em `zapp.campaigns` mas não há input no formulário; campanhas não podem ser agendadas pela UI.

### A7 — chatbot_flows e chatbot_executions não listadas no schema canônico
`chatbot/ChatbotExecutionsDashboard.tsx:63-68` — join duplo em `chatbot_flows(name)` e `contacts(name, phone)`. As tabelas `chatbot_flows` e `chatbot_executions` não aparecem em `docs/SCHEMA_REFERENCE.md` nem no `CLAUDE.md`; existência a confirmar em runtime.

### A8 — DiagnosticsView importa GmailStatusPanel (acoplamento entre módulos)
`diagnostics/DiagnosticsView.tsx:19` — importa `EmailStatusPanel` de `@/components/gmail/GmailStatusPanel`. Acoplamento transversal; DiagnosticsView passa a depender do módulo Gmail mesmo quando Gmail não estiver configurado.

### A9 — SystemFeaturesView: badge "100% Implementado" hardcoded
`docs/SystemFeaturesView.tsx:45` — badge hardcoded indica implementação completa de todas as features listadas, incluindo itens que são stubs (ex.: `export_user_data`, `sync_to_crm`). Informação enganosa para usuários administradores.

### A10 — EasterEggs: DeviceMotionEvent (shake detection) depreciado e requer permissão iOS
`effects/EasterEggs.tsx:187-200` — listener de `DeviceMotionEvent` para shake detection. Evento requer `requestPermission()` no iOS 13+ (não implementado); event listener é registrado sem verificação, o que pode gerar erro silencioso em iOS.

### A11 — SwDebugWidget: `zapp:debug:sw=1` pode persistir entre sessões
`debug/SwDebugWidget.tsx:29-38` — `isEnabled()` lê `localStorage.getItem('zapp:debug:sw')`. Um desenvolvedor que habilitar o widget em produção via DevTools pode esquecer de limpar o flag, expondo o widget para outros usuários na mesma máquina.

### A12 — PerformanceMonitor: possível state-update após desmontagem
`performance/PerformanceMonitor.tsx:165` — `setInterval` chama `collectMetrics` a cada 30s. O `mountedRef` é verificado dentro de `collectMetrics`, mas se o componente for desmontado enquanto a função está em execução assíncrona, setState pode ser chamado após unmount.

### A13 — OmnichannelInbox: `dbFrom('contacts')` não filtra por `channel_type`
`omnichannel/OmnichannelInbox.tsx:83` — mapeamento de `contacts` para `UnifiedMessage` não filtra por `channel_type`; todas as conexões ativas de todos os canais aparecem, baseado no campo `channel_type` do contato (não da sessão ativa).

### A14 — routing/AdminRoutes e DebugRoutes exportam funções, não componentes JSX
`routing/AdminRoutes.tsx` — exporta `adminRoutes()` (função que retorna JSX). Padrão necessário para React Router v6, mas não óbvio; montar `<AdminRoutes />` como componente seria erro silencioso de tipagem.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
