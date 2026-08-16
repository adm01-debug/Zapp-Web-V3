# Estado: Components — Layout, Gamification, TalkX, Catalog, Reports, Notifications

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 69/69

---

## 1. Visão Geral

Seis diretórios de componentes cobrindo infraestrutura de shell (layout), sistema de gamificação (gamification), módulo de campanhas em massa (talkx), catálogo de produtos externos (catalog), relatórios analíticos (reports) e painel de notificações (notifications). Nenhum arquivo está morto; todos fazem parte de fluxos funcionais. A inflação da biblioteca vem de sub-componentes internos (29 arquivos sem importador direto fora do próprio diretório — todos SEGURO pois são peças de módulos ativamente usados).

### Tabela de Arquivos

| arquivo | linhas | o que faz | EM_USO/ORFAO | COMPLETA/PARCIAL/STUB/MORTA | o que falta |
|---------|--------|-----------|--------------|----------------------------|-------------|
| **catalog/** | | | | | |
| ContactSelectionStep.tsx | 123 | Passo 2 do SendProductDialog — seleção de contato WA | ORFAO | COMPLETA | — |
| ExternalProductCard.tsx | 116 | Card de produto externo com grid/list e abertura de detalhe | ORFAO | COMPLETA | — |
| ExternalProductCatalog.tsx | 366 | Modal de catálogo com busca, filtros, paginação e envio | EM_USO | COMPLETA | — |
| ExternalProductManagement.tsx | 337 | Página `/catalog` de gestão de produtos (lazy) | EM_USO | COMPLETA | — |
| ProductDetailDialog.tsx | 321 | Dialog de detalhe completo com variantes e imagens | ORFAO | COMPLETA | — |
| ProductImageGrid.tsx | 76 | Grid de imagens selecionáveis dentro do fluxo de envio | ORFAO | COMPLETA | — |
| ProductVariantSelector.tsx | 120 | Seletor de variantes por grupo de cor | ORFAO | COMPLETA | — |
| SendProductDialog.tsx | 355 | Dialog de envio de produto para contato WA (2 etapas) | ORFAO | COMPLETA | — |
| WhatsAppTemplatesManager.tsx | 216 | CRUD de templates WA (lazy rota `wa-templates`) | EM_USO | COMPLETA | — |
| `__tests__/sendProductUtils.test.ts` | 335 | Testes Vitest de sendProductUtils | EM_USO (CI) | COMPLETA | — |
| sendProductUtils.ts | 136 | Utilitários puros: buildMessage, groupVariantsByColor, collectAllImages | ORFAO | COMPLETA | — |
| **gamification/** | | | | | |
| AchievementBadge.tsx | 260 | Badge visual de conquista (variante normal + mini) | EM_USO | COMPLETA | — |
| AchievementDetailDialog.tsx | 86 | Modal de detalhe de conquista individual | ORFAO | COMPLETA | — |
| AchievementToast.tsx | 290 | Toast animado de conquista + hook useAchievements | ORFAO | COMPLETA | — |
| AchievementsPanel.tsx | 226 | Painel com filtro/busca/tabs de conquistas | ORFAO | COMPLETA | — |
| AchievementsStats.tsx | 89 | Header de stats + badges XP/level; exporta isNewAchievement | ORFAO | COMPLETA | — |
| AchievementsSystem.tsx | 207 | View completa lazy-loaded via ViewRouter | EM_USO | COMPLETA | — |
| DemoAchievements.tsx | 210 | Widget dashboard de demonstração interativa | EM_USO | COMPLETA | — |
| GamificationProvider.tsx | 334 | Context provider + triggers de conquistas (streak, xp, level-up) | EM_USO | COMPLETA | — |
| MiniGameDialogs.tsx | 178 | 3 minijogos em Dialog: SpeedTyping, Quiz, EmojiDecode | ORFAO | COMPLETA | — |
| TrainingMiniGames.tsx | 129 | Seletor de minijogos com XP earned callback | EM_USO | COMPLETA | — |
| `__tests__/miniGamesData.test.ts` | 291 | Testes Vitest dos dados de minijogos | EM_USO (CI) | COMPLETA | — |
| miniGamesData.ts | 53 | Dados estáticos: perguntas, frases, emojis, tipos de jogo | ORFAO | COMPLETA | — |
| **layout/** | | | | | |
| AgentProfilePopover.tsx | 96 | Popover de perfil do agente com status online/away/offline | EM_USO | COMPLETA | — |
| AppShell.tsx | 258 | Shell principal desktop+mobile (Sidebar, VoiceOverlay, ZenMode) | EM_USO | COMPLETA | — |
| ConnectionPopoverContent.tsx | 226 | Lista filtrada de conexões WA com histórico de desconexões | EM_USO | COMPLETA | — |
| ConnectionStatusIndicator.tsx | 110 | Ícone Wifi + popover de status das conexões na sidebar | EM_USO | COMPLETA | — |
| IndexContentConnected.tsx | 132 | Orquestrador de hooks de boot (auth, onboarding, realtime, atalhos) | EM_USO | COMPLETA | — |
| PageHeader.tsx | 142 | Header com breadcrumb, botão voltar e actions slot | EM_USO | COMPLETA | — |
| PageTemplate.tsx | 129 | Wrapper com animação framer-motion para páginas | EM_USO | COMPLETA | — |
| Sidebar.tsx | 158 | Sidebar com nav, tema, collapse, favoritos, badges, notificações | EM_USO | COMPLETA | — |
| SidebarNavGroup.tsx | 139 | Grupo colapsável de itens nav com badges e animação | EM_USO | COMPLETA | — |
| SidebarNavItem.tsx | 160 | Item individual de nav com RBAC, prefetch, favorito, tooltip | EM_USO | COMPLETA | — |
| ViewLoadingFallback.tsx | 45 | Skeleton de loading para módulos lazy (Suspense fallback) | EM_USO | COMPLETA | — |
| connectionStatusStorage.ts | 90 | Helpers localStorage para filtro/histórico de conexões WA | EM_USO | COMPLETA | — |
| sidebarNavConfig.ts | 184 | Configuração declarativa de todos os itens de navegação | EM_USO | COMPLETA | — |
| **notifications/** | | | | | |
| NotificationChannelsAdmin.tsx | 545 | Admin UI para CRUD de canais e templates de notificação | EM_USO | PARCIAL | RLS de escrita em `notification_channels_config`; policies em `notification_templates` |
| NotificationQuietHoursCard.tsx | 67 | Card de horário silencioso via props | EM_USO | COMPLETA | — |
| NotificationSentimentCard.tsx | 105 | Card de alertas de sentimento com Slider | EM_USO | COMPLETA | — |
| NotificationSettingsPanel.tsx | 204 | Painel principal: sons, permissão browser, reset | EM_USO | COMPLETA | — |
| NotificationTypeCards.tsx | 249 | Re-exporta SentimentAlert + QuietHours; define SoundSelector | EM_USO | COMPLETA | — |
| PushNotificationCard.tsx | 113 | Card toggle de push notifications + botão de teste | EM_USO | COMPLETA | — |
| PushNotificationToggle.tsx | 77 | Botão compacto toggle push (Sidebar/AppBar) | EM_USO | COMPLETA | — |
| ScreenProtectionToggle.tsx | 72 | Toggle de proteção de tela via localStorage | EM_USO | COMPLETA | — |
| SoundMuteToggle.tsx | 55 | Botão mute de som via useNotificationSettings | EM_USO | COMPLETA | — |
| StatusLabelToggle.tsx | 55 | Toggle de label de status via useInboxStatusPref | EM_USO | COMPLETA | — |
| UnifiedNotificationProviders.tsx | 87 | Provider wrapper que ativa 3 hooks realtime + compat legado | EM_USO | COMPLETA | — |
| **reports/** | | | | | |
| AbandonmentRate.tsx | 135 | Pie chart de taxa de abandono via fetchAbandonmentRateMessages | ORFAO | COMPLETA | — |
| AdvancedReportsView.tsx | 367 | Orquestrador de relatórios: tabs, filtros, lazy-load de sub-views | EM_USO | COMPLETA | — |
| AutoExportManager.tsx | 33 | Tela bloqueada com ShieldAlert — sem lógica real de exportação | EM_USO | STUB | Implementação real de agendamento/exportação |
| ConversationHeatmap.tsx | 146 | Heatmap horas×dias via fetchContactMessagesForHeatmap | ORFAO | COMPLETA | — |
| DemandForecast.tsx | 169 | Previsão de demanda calculada localmente a partir do histórico | ORFAO | COMPLETA | — |
| ExportButton.tsx | 40 | Botão de exportação com prop getData: () => ReportData | EM_USO | COMPLETA | — |
| PeriodComparison.tsx | 185 | Comparação de dois períodos via dbFrom('messages') | ORFAO | COMPLETA | — |
| ReportCharts.tsx | 217 | Re-exporta reportChartsCommon + define DailyMessagesChart | ORFAO | COMPLETA | — |
| reportChartsCommon.tsx | 247 | Componentes compartilhados: ComparisonSummaryChart, PeriodAreaChart, etc. | ORFAO | COMPLETA | — |
| reportChartsHelpers.ts | 29 | Constantes COLORS, TOOLTIP_STYLE, interfaces ChartData | ORFAO | COMPLETA | — |
| useReportsData.ts | 340 | Hook React Query para mensagens e contatos via dbFrom | ORFAO | COMPLETA | — |
| **talkx/** | | | | | |
| TalkXAnalytics.tsx | 204 | Dashboard de métricas de campanhas (bar chart + pie) | ORFAO | COMPLETA | — |
| TalkXBlacklist.tsx | 289 | Gerencia lista de opt-out/blacklist com busca e modal | ORFAO | COMPLETA | — |
| TalkXCampaignCard.tsx | 246 | Card visual de campanha com progresso, status e ações | ORFAO | COMPLETA | — |
| TalkXCampaignEditor.tsx | 419 | Formulário de criação/edição de campanha com preview | ORFAO | COMPLETA | — |
| TalkXContactSelector.tsx | 132 | Seletor de contatos com filtros por empresa e tag | ORFAO | COMPLETA | — |
| TalkXLiveMonitor.tsx | 322 | Monitor em tempo real de envio com export CSV | ORFAO | COMPLETA | — |
| TalkXMessagePreview.tsx | 151 | Preview paginado de mensagem personalizada por contato | ORFAO | COMPLETA | — |
| TalkXRecipientsList.tsx | 115 | Lista de destinatários com status de envio (poll 30 s) | ORFAO | COMPLETA | — |
| TalkXView.tsx | 364 | Tela principal TalkX: listagem, filtros, tabs, realtime | EM_USO | COMPLETA | — |
| `__tests__/TalkX.test.tsx` | 278 | Testa hook useTalkX + lógica de personalização | EM_USO (CI) | COMPLETA | — |
| `__tests__/campaignEditorUtils.test.ts` | 212 | Testa exports puros de useCampaignEditor | EM_USO (CI) | COMPLETA | — |

---

## 2. Fluxos Funcionais

### Catálogo de Produtos Externos
```
ExternalProductManagement (ViewRouter /catalog)
  → ExternalProductCard → ProductDetailDialog
  → SendProductDialog
      → ContactSelectionStep → useContactSearch, useSendToContact
      → ProductImageGrid
      → ProductVariantSelector
      → sendProductUtils (buildMessage, groupVariantsByColor)

ExternalProductCatalog (modal em ChatInput)
  → ExternalProductCard → ProductDetailDialog
  → handleSend → sendProductUtils

WhatsAppTemplatesManager (ViewRouter /wa-templates)
  → useWhatsAppTemplates → zapp.whatsapp_templates (via hook)
```

### Gamificação
```
GamificationProvider (Context root — árvore completa da app)
  → AchievementToast → useAchievements → useAgentGamification
  → triggers: streak, xp, level-up via incrementMessages, updateStreak, grantAchievement

AchievementsSystem (ViewRouter /achievements)
  → AchievementsPanel → AchievementsStats, AchievementBadge, AchievementDetailDialog
  → useAgentGamification (features/admin)

DemoAchievements (DashboardWidgetRenderer)
  → AchievementsPanel

TrainingMiniGames (DashboardWidgetRenderer)
  → MiniGameDialogs → miniGamesData (SpeedTyping, Quiz, EmojiDecode)
```

### Layout / Shell
```
App.tsx → IndexContentConnected
  → useAppBootstrap (RPC rpc_app_bootstrap — badge não-lidos)
  → useOnboarding, useEmailOAuthFlow, useIndexKeyboardShortcuts, useWebhookHealthAlerts

AppShell → Sidebar → SidebarNavGroup → SidebarNavItem
                   → ConnectionStatusIndicator → ConnectionPopoverContent
                   → AgentProfilePopover
                   → PushNotificationToggle, ScreenProtectionToggle, StatusLabelToggle, SoundMuteToggle

Sidebar usa sidebarNavConfig (nav declarativa) + connectionStatusStorage (localStorage)
ViewLoadingFallback → Suspense fallback para lazy imports
PageTemplate / PageHeader → wrapper de páginas internas
```

### Notificações
```
App.tsx → UnifiedNotificationProviders
  → useRealtimeSentimentAlerts (realtime sentimento)
  → useSLANotifications (realtime SLA)
  → useGoalNotifications (realtime metas)

SettingsView → NotificationSettingsPanel
  → PushNotificationCard → usePushNotifications
  → NotificationTypeCards → NotificationSentimentCard, NotificationQuietHoursCard
  → SoundSelector (interno)

SettingsView → NotificationChannelsAdmin
  → useNotificationChannels → zapp.notification_channels_config, zapp.notification_templates
```

### Relatórios
```
ViewRouter /advanced-reports → AdvancedReportsView
  → AbandonmentRate → useAbandonmentRateData → evo.evolution_messages
  → ConversationHeatmap → useConversationHeatmap → evo.evolution_contacts/messages
  → DemandForecast → useConversationHeatmap (acoplamento semântico incorreto)
  → PeriodComparison → usePeriodComparison → dbFrom('messages')
  → ReportCharts → reportChartsCommon (ComparisonSummaryChart, PeriodAreaChart, AgentsChart)
  → useReportsData → dbFrom('messages'), dbFrom('contacts') via React Query

ViewRouter /auto-export → AutoExportManager (STUB — bloqueia UI)
ExportButton → usado por AdvancedReportsView, SLAHistoryDashboard, SLADashboard
```

### TalkX (Campanhas em Massa)
```
ViewRouter /talkx → TalkXView
  → lista de campanhas via useTalkX → zapp.talkx_campaigns
  → realtime channel 'talkx-realtime:{random}' → zapp.talkx_campaigns
  → TalkXCampaignCard (card visual)
  → TalkXAnalytics (métricas)
  → TalkXBlacklist → useTalkXBlacklist → (blacklist CRUD)

TalkXView → TalkXCampaignEditor
  → useCampaignEditor (VARIABLES, MESSAGE_TEMPLATES, MEDIA_TYPES)
  → TalkXContactSelector → safeClient → zapp.contacts, zapp.empresas
  → TalkXMessagePreview (preview personalizado por contato)

TalkXView → TalkXLiveMonitor
  → realtime channel 'talkx-monitor-{id}:{random}' → zapp.talkx_recipients
  → TalkXRecipientsList (poll 30 s via safeClient)
  → export CSV
```

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

| Tipo | Nome | Schema | Quem usa |
|------|------|--------|----------|
| **Tabela** | `whatsapp_connections` | `zapp` | ConnectionStatusIndicator → useConnectionStatusIndicator |
| **Tabela** | `notification_channels_config` | `zapp` | NotificationChannelsAdmin → useNotificationChannels |
| **Tabela** | `notification_templates` | `zapp` | NotificationChannelsAdmin → useNotificationChannels |
| **Tabela** | `talkx_campaigns` | `zapp` | TalkXView, TalkXLiveMonitor → useTalkX |
| **Tabela** | `talkx_recipients` | `zapp` | TalkXRecipientsList, TalkXLiveMonitor → safeClient |
| **Tabela** | `messages` | `zapp` | useReportsData, PeriodComparison → dbFrom |
| **Tabela** | `contacts` | `zapp` | useReportsData, TalkXContactSelector → dbFrom / safeClient |
| **Tabela** | `evolution_messages` | `evo` | useAbandonmentRateData, useConversationHeatmap (via hooks) |
| **Tabela** | `evolution_contacts` | `evo` | useConversationHeatmap (via hook) |
| **RPC** | `rpc_app_bootstrap` | `zapp` | IndexContentConnected → useAppBootstrap (badge não-lidos) |
| **Realtime** | `postgres_changes *` em `whatsapp_connections` | `zapp` | useConnectionStatusIndicator |
| **Realtime** | `talkx-realtime:{random}` em `talkx_campaigns` | `zapp` | TalkXView:93 |
| **Realtime** | `talkx-monitor-{id}:{random}` em `talkx_recipients` | `zapp` | TalkXLiveMonitor:45 |
| **Realtime** | `useRealtimeSentimentAlerts` | `zapp` | UnifiedNotificationProviders |
| **Realtime** | `useSLANotifications` | — | UnifiedNotificationProviders |
| **Realtime** | `useGoalNotifications` | — | UnifiedNotificationProviders |
| **Edge Function** | `evolution-api` (reconectar) | — | useConnectionStatusIndicator |
| **Edge Function** | invocada indiretamente via useTalkX | — | TalkX.test.tsx:36 (mock) |

---

## 4. Exports Públicos por Categoria

**catalog**: `ExternalProductCatalog`, `ExternalProductManagement`, `WhatsAppTemplatesManager`; utils: `buildMessage`, `groupVariantsByColor`, `collectAllImages`, `sendProduct*` types

**gamification**: `GamificationProvider`, `AchievementsSystem`, `DemoAchievements`, `TrainingMiniGames`, `AchievementBadge`; hook: `useAchievements`; tipo: `AchievementType`; util: `isNewAchievement`

**layout**: `AppShell`, `IndexContentConnected`, `Sidebar`, `PageTemplate`, `PageHeader`, `ViewLoadingFallback`; configs: `sidebarNavConfig`, `connectionStatusStorage`

**notifications**: `UnifiedNotificationProviders`, `NotificationSettingsPanel`, `NotificationChannelsAdmin`, `PushNotificationToggle`, `ScreenProtectionToggle`, `StatusLabelToggle`, `SoundMuteToggle`

**reports**: `AdvancedReportsView`, `AutoExportManager`, `ExportButton`; hook: `useReportsData`; helpers: `reportChartsHelpers` (COLORS, TOOLTIP_STYLE)

**talkx**: `TalkXView`

---

## 5. Chama (Saída)

**Hooks externos consumidos:**
- `@/hooks/useExternalApiManagement` (useExternalCatalog, ExternalProduct, ExternalProductVariant)
- `@/hooks/catalog/useSendProduct` (useContactSearch, useSendToContact)
- `@/hooks/useWhatsAppTemplates`, `@/hooks/use-toast`, `@/hooks/useAbandonmentRateData`
- `@/hooks/useConversationHeatmap`, `@/hooks/usePeriodComparison`, `@/hooks/useTags`
- `@/hooks/useTalkX`, `@/hooks/useTalkXBlacklist`, `@/hooks/useTalkXCampaignLive`, `@/hooks/useCampaignEditor`
- `@/hooks/useNotificationSettings`, `@/hooks/useNotificationChannels`, `@/hooks/usePushNotifications`
- `@/hooks/useViewTransition`, `@/hooks/useIsMobile`, `@/hooks/useZenMode`, `@/hooks/useTheme`
- `@/hooks/useSidebarCollapse`, `@/hooks/useSidebarFavorites`, `@/hooks/useConnectionStatusIndicator`
- `@/hooks/useCurrentModule`, `@/hooks/usePrefetchOnHover`, `@/hooks/useAppBootstrap`
- `@/features/auth` (useAuth, useUserRole), `@/features/admin` (useAgentGamification, useAgents, ACHIEVEMENT_TYPES)
- `@/features/sla` (useSLANotifications), `@/features/inbox` (useInboxStatusPref)
- `@/integrations/datasource/db` (dbFrom), `@/integrations/supabase/client`, `@/integrations/supabase/safeClient`
- `@/integrations/supabase/schema` (ContactRow, Json)
- `@/services/api/queryKeys`, `@/utils/exportReport`, `@/utils/notificationSounds`
- `@/lib/utils` (cn), `@/lib/logger`, `@/lib/evolutionInstance`
- `@/components/effects/Confetti` (useCelebration)
- `@/components/settings/ConnectionAlertPreferences`
- `@/components/ui/*` (shadcn/ui), `framer-motion`, `lucide-react`, `recharts`, `date-fns`, `@tanstack/react-query`

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | importadores externos |
|---------|-------------|----------------------|
| ExternalProductCatalog | InputExtraTools, ChatDialogs, ChatInputToolbars | 3 |
| ExternalProductManagement | lazyViews → ViewRouter | 1 (rota `/catalog`) |
| WhatsAppTemplatesManager | lazyViews → ViewRouter | 1 (rota `/wa-templates`) |
| AchievementBadge | LeaderboardHelpers (externo), AchievementsPanel | 1+ |
| AchievementsSystem | lazyViews → ViewRouter | 1 (rota `/achievements`) |
| DemoAchievements | DashboardWidgetRenderer | 1 |
| GamificationProvider | DemoAchievements + toda a árvore indiretamente | 1+ |
| TrainingMiniGames | DashboardWidgetRenderer | 1 |
| AppShell | App.tsx | 1 |
| IndexContentConnected | App.tsx | 1 |
| Sidebar | AppShell | 1 |
| PageTemplate | múltiplas pages | N |
| PageHeader | múltiplas pages | N |
| ViewLoadingFallback | Suspense boundaries em lazy routes | N |
| AgentProfilePopover | Sidebar | 1 |
| ConnectionStatusIndicator | Sidebar | 1 |
| ConnectionPopoverContent | ConnectionStatusIndicator | 1 |
| sidebarNavConfig | Sidebar, SidebarNavGroup, SidebarNavItem | 3 |
| connectionStatusStorage | ConnectionStatusIndicator, ConnectionPopoverContent | 2 |
| UnifiedNotificationProviders | App.tsx | 1 |
| NotificationSettingsPanel | SettingsView | 1 |
| NotificationChannelsAdmin | SettingsView | 1 |
| PushNotificationToggle | Sidebar, IndexContentConnected | 2 |
| ScreenProtectionToggle | Sidebar, IndexContentConnected | 2 |
| SoundMuteToggle | Sidebar, IndexContentConnected | 2 |
| StatusLabelToggle | Sidebar, IndexContentConnected, App.tsx | 3 |
| AdvancedReportsView | lazyViews → ViewRouter | 1 (rota `/advanced-reports`) |
| AutoExportManager | lazyViews → ViewRouter | 1 (rota `/auto-export`) |
| ExportButton | AdvancedReportsView, SLAHistoryDashboard, SLADashboard | 3 |
| TalkXView | lazyViews, ViewRouter, CampaignCreateDialog | 3 |

---

## 7. Órfãos

Todos os 29 arquivos órfãos são **sub-componentes internos** de módulos ativamente usados. Nenhum é código morto — são peças de uma feature com entry point externo. Veredito geral: **SEGURO**.

### catalog (7 arquivos) — sub-componentes do fluxo Send Product

| arquivo | tamanho | veredito | motivo |
|---------|---------|----------|--------|
| ContactSelectionStep.tsx | 123 linhas | SEGURO | Passo 2 do SendProductDialog; cadeia ativa |
| ExternalProductCard.tsx | 116 linhas | SEGURO | Sub-componente de ExternalProductCatalog e ExternalProductManagement |
| ProductDetailDialog.tsx | 321 linhas | SEGURO | Aberto por ExternalProductCard; fluxo completo |
| ProductImageGrid.tsx | 76 linhas | SEGURO | Sub-componente interno do SendProductDialog |
| ProductVariantSelector.tsx | 120 linhas | SEGURO | Sub-componente interno do SendProductDialog |
| SendProductDialog.tsx | 355 linhas | SEGURO | Usado por ExternalProductManagement e ExternalProductCatalog (intra-dir) |
| sendProductUtils.ts | 136 linhas | SEGURO | Utilitários puros testados; base do fluxo de envio |

### gamification (6 arquivos) — sub-componentes da árvore de gamificação

| arquivo | tamanho | veredito | motivo |
|---------|---------|----------|--------|
| AchievementDetailDialog.tsx | 86 linhas | SEGURO | Modal usado por AchievementsSystem (externo via ViewRouter) |
| AchievementToast.tsx | 290 linhas | SEGURO | Usado por GamificationProvider que está em toda a árvore |
| AchievementsPanel.tsx | 226 linhas | SEGURO | Núcleo funcional de DemoAchievements (externo via DashboardWidgetRenderer) |
| AchievementsStats.tsx | 89 linhas | SEGURO | Usado por AchievementsPanel |
| MiniGameDialogs.tsx | 178 linhas | SEGURO | Implementação dos 3 jogos; usado por TrainingMiniGames (externo) |
| miniGamesData.ts | 53 linhas | SEGURO | Dados estáticos testados; base de MiniGameDialogs e TrainingMiniGames |

### reports (8 arquivos) — sub-componentes de AdvancedReportsView

| arquivo | tamanho | veredito | motivo |
|---------|---------|----------|--------|
| AbandonmentRate.tsx | 135 linhas | SEGURO | Sub-view de AdvancedReportsView (rota externa) |
| ConversationHeatmap.tsx | 146 linhas | SEGURO | Sub-view de AdvancedReportsView |
| DemandForecast.tsx | 169 linhas | SEGURO | Sub-view de AdvancedReportsView |
| PeriodComparison.tsx | 185 linhas | SEGURO | Sub-view de AdvancedReportsView |
| ReportCharts.tsx | 217 linhas | SEGURO | Re-exports usados por AdvancedReportsView |
| reportChartsCommon.tsx | 247 linhas | SEGURO | Componentes base de ReportCharts |
| reportChartsHelpers.ts | 29 linhas | SEGURO | Constantes de estilo compartilhadas internamente |
| useReportsData.ts | 340 linhas | SEGURO | Hook consumido por AdvancedReportsView |

### talkx (8 arquivos) — sub-componentes de TalkXView

| arquivo | tamanho | veredito | motivo |
|---------|---------|----------|--------|
| TalkXAnalytics.tsx | 204 linhas | SEGURO | Tab analytics de TalkXView (externo via ViewRouter) |
| TalkXBlacklist.tsx | 289 linhas | SEGURO | Tab blacklist de TalkXView |
| TalkXCampaignCard.tsx | 246 linhas | SEGURO | Card de listagem de TalkXView |
| TalkXCampaignEditor.tsx | 419 linhas | SEGURO | Editor completo usado por TalkXView |
| TalkXContactSelector.tsx | 132 linhas | SEGURO | Seletor de contatos de TalkXCampaignEditor |
| TalkXLiveMonitor.tsx | 322 linhas | SEGURO | Monitor ao vivo usado por TalkXView |
| TalkXMessagePreview.tsx | 151 linhas | SEGURO | Preview de mensagem usado por TalkXCampaignEditor |
| TalkXRecipientsList.tsx | 115 linhas | SEGURO | Lista de destinatários de TalkXLiveMonitor e TalkXContactSelector |

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| ContactSelectionStep.tsx | COMPLETA | — |
| ExternalProductCard.tsx | COMPLETA | — |
| ExternalProductCatalog.tsx | COMPLETA | — |
| ExternalProductManagement.tsx | COMPLETA | — |
| ProductDetailDialog.tsx | COMPLETA | — |
| ProductImageGrid.tsx | COMPLETA | — |
| ProductVariantSelector.tsx | COMPLETA | — |
| SendProductDialog.tsx | COMPLETA | — |
| WhatsAppTemplatesManager.tsx | COMPLETA | — |
| sendProductUtils.ts | COMPLETA | — |
| AchievementBadge.tsx | COMPLETA | — |
| AchievementDetailDialog.tsx | COMPLETA | — |
| AchievementToast.tsx | COMPLETA | — |
| AchievementsPanel.tsx | COMPLETA | — |
| AchievementsStats.tsx | COMPLETA | — |
| AchievementsSystem.tsx | COMPLETA | — |
| DemoAchievements.tsx | COMPLETA | — |
| GamificationProvider.tsx | COMPLETA | — |
| MiniGameDialogs.tsx | COMPLETA | — |
| TrainingMiniGames.tsx | COMPLETA | — |
| miniGamesData.ts | COMPLETA | — |
| AgentProfilePopover.tsx | COMPLETA | — |
| AppShell.tsx | COMPLETA | — |
| ConnectionPopoverContent.tsx | COMPLETA | — |
| ConnectionStatusIndicator.tsx | COMPLETA | — |
| IndexContentConnected.tsx | COMPLETA | — |
| PageHeader.tsx | COMPLETA | — |
| PageTemplate.tsx | COMPLETA | — |
| Sidebar.tsx | COMPLETA | — |
| SidebarNavGroup.tsx | COMPLETA | — |
| SidebarNavItem.tsx | COMPLETA | — |
| ViewLoadingFallback.tsx | COMPLETA | — |
| connectionStatusStorage.ts | COMPLETA | — |
| sidebarNavConfig.ts | COMPLETA | — |
| NotificationChannelsAdmin.tsx | PARCIAL | RLS policies de escrita em `notification_channels_config` e `notification_templates` ausentes |
| NotificationQuietHoursCard.tsx | COMPLETA | — |
| NotificationSentimentCard.tsx | COMPLETA | — |
| NotificationSettingsPanel.tsx | COMPLETA | — |
| NotificationTypeCards.tsx | COMPLETA | — |
| PushNotificationCard.tsx | COMPLETA | — |
| PushNotificationToggle.tsx | COMPLETA | — |
| ScreenProtectionToggle.tsx | COMPLETA | — |
| SoundMuteToggle.tsx | COMPLETA | — |
| StatusLabelToggle.tsx | COMPLETA | — |
| UnifiedNotificationProviders.tsx | COMPLETA | — |
| AbandonmentRate.tsx | COMPLETA | — |
| AdvancedReportsView.tsx | COMPLETA | — |
| AutoExportManager.tsx | STUB | Implementação real de exportação agendada |
| ConversationHeatmap.tsx | COMPLETA | — |
| DemandForecast.tsx | COMPLETA | — |
| ExportButton.tsx | COMPLETA | — |
| PeriodComparison.tsx | COMPLETA | — |
| ReportCharts.tsx | COMPLETA | — |
| reportChartsCommon.tsx | COMPLETA | — |
| reportChartsHelpers.ts | COMPLETA | — |
| useReportsData.ts | COMPLETA | — |
| TalkXAnalytics.tsx | COMPLETA | — |
| TalkXBlacklist.tsx | COMPLETA | — |
| TalkXCampaignCard.tsx | COMPLETA | — |
| TalkXCampaignEditor.tsx | COMPLETA | — |
| TalkXContactSelector.tsx | COMPLETA | — |
| TalkXLiveMonitor.tsx | COMPLETA | — |
| TalkXMessagePreview.tsx | COMPLETA | — |
| TalkXRecipientsList.tsx | COMPLETA | — |
| TalkXView.tsx | COMPLETA | — |

---

## 9. Achados

### A1 — RLS ausente em notification_templates (segurança — produção quebra ao salvar)
`NotificationChannelsAdmin.tsx:45-49` — `notification_templates` não tem nenhuma policy RLS; `notification_channels_config` tem apenas SELECT. Salvar ou excluir retorna 42501 em produção. Alerta visual duplicado no DOM (linha 232) repete o aviso sem resolver.

### A2 — Leak de subscription Realtime com Math.random() sem deps estáveis
`TalkXLiveMonitor.tsx:45` e `TalkXView.tsx:93` — channel names gerados com `Math.random()` em `useEffect` sem deps estabilizadas. Se o componente remontar (StrictMode, hot-reload), novo canal é criado sem remover o anterior → leak de subscriptions. Mesmo padrão em `useConnectionStatusIndicator.ts:147` (layout).

### A3 — ConversationHeatmap duplicado entre reports e dashboard
`src/components/dashboard/ConversationHeatmap.tsx` (328 linhas) e `src/components/reports/ConversationHeatmap.tsx` (146 linhas) — mesmo nome, implementações distintas. Dashboard usa `useState`/`fetchContactMessagesForHeatmap`; reports usa hooks. Risco de divergência silenciosa de comportamento.

### A4 — AutoExportManager é STUB funcional (rota `/auto-export` entrega UI bloqueada)
`AutoExportManager.tsx:8` — JSDoc documenta explicitamente que "no actual export is performed"; renderiza apenas `ShieldAlert`. A rota existe no ViewRouter mas é dead feature. Candidato a remover rota ou implementar.

### A5 — SOUND_TYPES duplicado entre NotificationTypeCards e NotificationSettingsPanel
`NotificationTypeCards.tsx:23` + `NotificationSettingsPanel.tsx:29` — mesma constante com tipo ligeiramente diferente (`SoundTypeOption` vs `string`). Candidato a extração para utilitário compartilhado.

### A6 — DemandForecast importa hook semanticamente incorreto
`DemandForecast.tsx:3` — usa `fetchContactMessagesForHeatmap` (nominalmente para heatmap) para calcular previsão de demanda. Acoplamento semântico incorreto; deveria ter hook próprio `useDemandForecast`.

### A7 — TOOLTIP_STYLE duplicado entre reports e queues
`reportChartsHelpers.ts:11` — `TOOLTIP_STYLE` quase idêntico ao de `src/components/queues/chartConfig.ts`. Candidato à extração para `src/lib/chartConfig.ts`.

### A8 — AchievementBadge duplicado em LeaderboardHelpers
`LeaderboardHelpers.tsx:64` — define componente local `AchievementBadge` com mesma assinatura do `gamification/AchievementBadge.tsx` sem reutilizar o original. Duplicata potencial; sem unificação.

### A9 — formatPrice e handleImageError duplicados entre ExternalProductCard e ProductDetailDialog
`ExternalProductCard.tsx:16-25` e `ProductDetailDialog.tsx:21-43` — funções literalmente duplicadas. Candidatos a extração para helper interno do diretório catalog.

### A10 — UnifiedNotificationProviders pode ativar hooks em duplicata
`UnifiedNotificationProviders.tsx:62,73,84` — mantém 3 providers legados (`SLANotificationProvider`, `GoalNotificationProvider`, `RealtimeSentimentAlertProvider`) como compat; se renderizados em paralelo com os hooks novos do `UnifiedNotificationProviders`, os hooks disparam duas vezes sem proteção.

### A11 — TalkX.test.tsx copia lógica de personalização em vez de reutilizar
`TalkX.test.tsx:106-113` — função `personalize` duplicada inline no teste em vez de importar a real de `TalkXMessagePreview.tsx:20-24`. Testa um clone, não o original.

### A12 — sidebarNavConfig: communicationNav é alias de automationNav (legado)
`sidebarNavConfig.ts:174` — `communicationNav = automationNav`; backward-compat alias sem uso ativo. Pode confundir; candidato a remoção.

### A13 — IndexContentConnected retorna null sem feedback se !user
`IndexContentConnected.tsx:86` — `return null` silencioso durante carregamento de auth. Usuário vê tela em branco sem spinner ou redirect explícito.

### A14 — TalkXRecipientsList.tsx: TALKX_POLL_INTERVAL e TALKX_RECIPIENTS_LIMIT hardcoded
`TalkXRecipientsList.tsx:10` — `TALKX_POLL_INTERVAL = 30_000` e `TALKX_RECIPIENTS_LIMIT = 200` sem configuração externa. Mudanças requerem redeploy.

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
