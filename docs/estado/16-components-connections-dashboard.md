# Estado: components/connections e components/dashboard

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 65/65

## 1. Visão Geral

`connections/` contém 33 arquivos com a UI de gerenciamento de conexões WhatsApp (card de status, QR code, configurações de instância, integrações, horários de funcionamento, bridge Supabase-Evolution). `dashboard/` contém 32 arquivos com o painel principal de métricas, sentimento, SLA, gamificação, war room, previsão de demanda e KPIs diários.

### Tabela de Arquivos — connections/

| arquivo | linhas | o que faz em 1 linha | EM_USO/ORFAO | COMPLETA/PARCIAL/STUB/MORTA | o que falta |
|---|---|---|---|---|---|
| AddConnectionDialog.tsx | 144 | Modal criação de nova conexão WA (form name/phone/api_type) | ORFAO | COMPLETA | não importado por nenhum arquivo, nem mesmo internamente |
| BridgeSupabaseView.tsx | 114 | Painel diagnóstico ponte Supabase↔Evolution | EM_USO | COMPLETA | — |
| BusinessHoursDialog.tsx | 262 | Dialog horários de funcionamento por dia da semana | EM_USO | COMPLETA | — |
| BusinessHoursIndicator.tsx | 59 | Indicador visual inline (7 quadrados D/S/T…) dias abertos/fechados | EM_USO | COMPLETA | — |
| ConnectionAuditDialog.tsx | 150 | Dialog log de auditoria da instância via `audit_logs` | EM_USO | COMPLETA | — |
| ConnectionCard.tsx | 359 | Card de conexão com status, bateria, ações (QR/menu/disconnect/audit) | EM_USO | COMPLETA | — |
| ConnectionCardMenu.tsx | 175 | DropdownMenu ações do card (recheck, QR, fila, settings, integrações, histórico, deletar) | EM_USO | COMPLETA | — |
| ConnectionDisconnectDialog.tsx | 70 | AlertDialog confirmação desconexão WA | EM_USO | COMPLETA | — |
| ConnectionQueuesDialog.tsx | 108 | Dialog vínculo connection↔queues via checkboxes | EM_USO | COMPLETA | — |
| ConnectionsIntegrationsHub.tsx | 71 | Shell abas Conexões / Integrações / Ponte Supabase | EM_USO | COMPLETA | — |
| ConnectionsStats.tsx | 61 | Três cards estatística (total/online/ações) com Framer Motion | ORFAO | COMPLETA | ConnectionsView não usa; só aparece em teste unitário |
| ConnectionsView.tsx | 733 | View principal: lista conexões, orquestra QR/settings/sync Evolution | EM_USO | COMPLETA | — |
| DegradedQuickActions.tsx | 197 | Card ações rápidas p/ conexões degradadas (health-check, QR regen) | ORFAO | COMPLETA | zero importadores fora de connections/ |
| IdempotencyMissBanner.tsx | 148 | Banner admin sobre cache de envio Evolution (miss > threshold) | ORFAO | COMPLETA | zero importadores fora de connections/ |
| InstanceSettingsDialog.tsx | 496 | Dialog configurações instância (settings/privacy/labels/reconexão) | ORFAO | COMPLETA | zero importadores fora de connections/ |
| InstanceSettingsTabContent.tsx | 101 | Sub-componentes tabs Settings/Privacy/Labels do dialog acima | ORFAO | COMPLETA | zero importadores fora de connections/ |
| IntegrationsPanel.tsx | 326 | Dialog integrações: Typebot, OpenAI, Dify, Flowise, Chatwoot, EvolutionBot | ORFAO | COMPLETA | zero importadores fora de connections/ |
| NumberReputationMonitor.tsx | 160 | Monitor reputação número WA (score, warmup); auto-oculta se vazio | ORFAO | COMPLETA | zero importadores fora de connections/ |
| OfficialApiConfigDialog.tsx | 343 | Dialog config WA Cloud API (Meta): WABA, token, webhook URL | EM_USO | COMPLETA | — |
| QrAttemptHistory.tsx | 110 | Histórico tentativas QR (connected/expired/error/pending) | EM_USO | COMPLETA | — |
| QrCodeDialog.tsx | 214 | Dialog exibindo QR code, status e rawPayload mascarado | EM_USO | COMPLETA | — |
| QrCountdown.tsx | 43 | Countdown de segundos até expirar o QR | ORFAO | COMPLETA | zero importadores fora de connections/ |
| QrTtlBadge.tsx | 60 | Badge TTL QR com origem (detected/default/clamped), tooltip diagnóstico | EM_USO | COMPLETA | — |
| RefreshQrButton.tsx | 157 | Botão refresh QR com cooldown 5s e estabilização de status 400ms | EM_USO | COMPLETA | — |
| __tests__/ConnectionsStats.test.tsx | 157 | Testes ConnectionsStats: 0/1/N conexões, plural, cores, sobreposição | EM_USO | COMPLETA | — |
| bridge/BridgeInfoRow.tsx | 15 | Row label+value para painel bridge (opcional mono font) | EM_USO | COMPLETA | — |
| bridge/BridgeStatCard.tsx | 22 | Card stat bridge com tone success/error/neutro | EM_USO | COMPLETA | — |
| bridge/BridgeStatusBadge.tsx | 41 | Badge Online/Offline/Verificando/Não configurado | EM_USO | COMPLETA | — |
| connectionCardHelpers.ts | 95 | `statusConfig` (5 estados WA), `HEALTH_REASON_LABEL` (8), `getLastActivity()` | EM_USO | COMPLETA | — |
| integrationsPanelFields.ts | 72 | Definições de campos para 6 integrações (Typebot→EvolutionBot) | EM_USO | COMPLETA | — |
| integrationsPanelParts.tsx | 82 | `<IntegrationForm>` genérico reutilizável (Switch+Input+Save+Remove) | EM_USO | COMPLETA | — |
| types.ts | 15 | Tipos locais: `HubTab`, `BridgeStatus`, `HealthRow` | EM_USO | COMPLETA | — |
| useConnectionCardActions.ts | 83 | Hook: `handleReconnect` (restart→healthcheck→QR fallback) e `handleRecheckNow` via EF | EM_USO | COMPLETA | — |

### Tabela de Arquivos — dashboard/

| arquivo | linhas | o que faz em 1 linha | EM_USO/ORFAO | COMPLETA/PARCIAL/STUB/MORTA | o que falta |
|---|---|---|---|---|---|
| AIQuickAccess.tsx | 226 | Cards acesso rápido a funcionalidades de IA; navega para rotas existentes e inexistentes | EM_USO | COMPLETA | rotas `/voice-changer`, `/ai-summary` não existem |
| AIStatsWidget.tsx | 213 | Gráfico de área + métricas sentimento IA via `useAIStats` | EM_USO | COMPLETA | — |
| ActivityHeatmap.tsx | 300 | Heatmap atividade estilo GitHub (3m/6m/1a) via query em `messages` | EM_USO | COMPLETA | métrica `resolutions` não implementada no queryFn |
| AgentPerformancePanel.tsx | 126 | Ranking gamificado agentes top 10 via `useAgentPerformanceRanking` | EM_USO | COMPLETA | typo `messagessSent` (3×s) — dado provavelmente undefined |
| ConversationHeatmap.tsx | 328 | Heatmap dia×hora 7×24 (volume/tempo-resposta/satisfação) via `messages` | EM_USO | COMPLETA | métricas `response_time` e `satisfaction` retornam zeros |
| DailyMetricsKpis.tsx | 172 | 7 KPI cards últimos 7 dias via view `zapp.evolution_daily_metrics` | EM_USO | COMPLETA | — |
| DashboardFilters.tsx | 307 | Popover filtros (período, fila, agente, intervalo personalizado); exporta `DashboardFiltersState` | EM_USO | COMPLETA | — |
| DashboardSectionHeader.tsx | 96 | Cabeçalho recolhível de seção com variantes de cor; exporta `WidgetSection` | EM_USO | COMPLETA | — |
| DashboardToolbar.tsx | 46 | Toolbar refresh/export/filter sem estado próprio | ORFAO | MORTA | DashboardView usa DashboardFilters diretamente; toolbar nunca renderizada |
| DashboardView.tsx | 322 | Componente raiz do dashboard, 5 tabs (overview/analytics/goals/ai/sla) | EM_USO | COMPLETA | XP/coins/streak hardcoded (1250/89/7) |
| DashboardWidgetRenderer.tsx | 324 | Renderiza widgets dinâmicos por tipo; contém buildStatsCards, ChallengesWidget, QueuesWidget, ActivityWidget | EM_USO | COMPLETA | eslint-disable sugere split pendente |
| DemandPrediction.tsx | 256 | Gráfico Recharts de previsão de demanda + insights via `useDemandPrediction` | EM_USO | COMPLETA | — |
| FloatingParticles.tsx | 111 | Partículas animadas (framer-motion) decorativas, respeita prefers-reduced-motion | EM_USO | COMPLETA | — |
| GamificationEffects.tsx | 332 | Exporta AnimatedBadge, StatCardWithGamification, LevelProgress; badges XP/coins/streak/rank | EM_USO | COMPLETA | CSS vars `hsl(var(--xp))` etc. precisam estar definidas no tema |
| GoalsConfigDialog.tsx | 259 | Dialog de config de metas via `useGoalsConfig`/`useSaveGoals` | EM_USO | COMPLETA | — |
| GoalsDashboard.tsx | 134 | Dashboard de metas com progresso geral, seletor de período, CelebrationOverlay | EM_USO | COMPLETA | — |
| HealthScoreCard.tsx | 135 | Card com RPC `fn_system_health_score` (score/grade/breakdown); refresca 5 min | EM_USO | COMPLETA | — |
| MiniSparkline.tsx | 31 | SVG mini-gráfico animado (framer-motion); usado por GamificationEffects | EM_USO | COMPLETA | — |
| ProgressiveDisclosureDashboard.tsx | 205 | Layout colapsível de widgets; exporta `ProgressiveDisclosureDashboard` e `EnhancedProgressiveDisclosure` | EM_USO | COMPLETA | EnhancedProgressiveDisclosure sem importadores externos identificados |
| RealtimeMetricsPanel.tsx | 185 | Painel métricas realtime (msgs/hora, min, conversas ativas) via `useRealtimeDashboard` | EM_USO | COMPLETA | — |
| SLAMetricsDashboard.tsx | 156 | Métricas SLA (first response, breach rate) por agente/período via `useSLAMetrics` | EM_USO | COMPLETA | — |
| SatisfactionMetrics.tsx | 61 | Card CSAT/NPS — stub explícito: `dataUnavailable = true`, exibe estado indisponível | EM_USO | STUB | integrar hook/tabela de avaliações |
| ScheduledReportsManager.tsx | 271 | UI CRUD para agendamento de relatórios via `useScheduledReports` | EM_USO | COMPLETA | — |
| SentimentAlertsDashboard.tsx | 69 | Container abas (overview/agentes/alertas/distribuição) sentimentos | EM_USO | COMPLETA | botão "Exportação Bloqueada" permanentemente disabled |
| SentimentHelpers.tsx | 141 | Barrel: re-exporta `useRealSentimentData`, SentimentIcon, TrendIndicator, SentimentStatsCards | EM_USO | COMPLETA | — |
| SentimentTabContent.tsx | 302 | 4 sub-tabs (OverviewTab, AgentsTab, AlertsTab, DistributionTab) do SentimentAlertsDashboard | EM_USO | COMPLETA | — |
| SentimentTrendChart.tsx | 94 | Gráfico de área Recharts métricas sentimento; prop `onExport` não implementada no chamador | EM_USO | COMPLETA | DashboardView não passa handler onExport |
| WarRoomDashboard.tsx | 286 | Painel operacional realtime: métricas, filas, alertas, agentes | EM_USO | COMPLETA | — |
| war-room/WarRoomAgentCard.tsx | 54 | Card agente com status online/busy/away/offline e utilização | EM_USO | COMPLETA | — |
| war-room/WarRoomAlertRow.tsx | 36 | Linha alerta animada (critical/warning/info) com dismiss | EM_USO | COMPLETA | — |
| war-room/WarRoomMetricCard.tsx | 40 | Card métrica numérica com trend up/down e alerta visual (animate-pulse em critical) | EM_USO | COMPLETA | — |
| war-room/WarRoomQueueRow.tsx | 64 | Linha de fila com progresso, badges SLA breach/warning e cor customizada | EM_USO | COMPLETA | — |

---

## 2. Fluxos funcionais

### Fluxo connections — Gerenciamento de Conexão WA

```
ConnectionsIntegrationsHub
  └─ ConnectionsView (lazyViews.ts)
       ├─ ConnectionCard
       │    ├─ ConnectionCardMenu → InstanceSettingsDialog, IntegrationsPanel, ConnectionDisconnectDialog, ConnectionQueuesDialog, ConnectionAuditDialog
       │    ├─ useConnectionCardActions → Edge Function connection-health-check
       │    ├─ BusinessHoursDialog → useBusinessHoursManagement → {business_hours, away_messages, RPC is_within_business_hours}
       │    ├─ BusinessHoursIndicator → useBusinessHoursManagement
       │    └─ connectionCardHelpers (statusConfig, HEALTH_REASON_LABEL)
       ├─ QrCodeDialog → QrAttemptHistory, QrTtlBadge, RefreshQrButton, QrCountdown
       ├─ OfficialApiConfigDialog → whatsapp_official_credentials (upsert), EF whatsapp-cloud-api
       ├─ NumberReputationMonitor → useNumberReputation
       ├─ DegradedQuickActions → EF connection-health-check
       ├─ IdempotencyMissBanner → useIdempotencyMissAlerts
       └─ EF evolution-sync (sync periódico)
BridgeSupabaseView → useBridgeHealth
  └─ bridge/{BridgeInfoRow, BridgeStatCard, BridgeStatusBadge}
```

### Fluxo dashboard — Visão Geral

```
DashboardView (lazyViews.ts + ViewRouter.tsx)
  ├─ Tab overview → DailyMetricsKpis (zapp.evolution_daily_metrics), ConversationHeatmap (messages), ActivityHeatmap (messages), AgentPerformancePanel, SatisfactionMetrics [STUB]
  ├─ Tab analytics → DashboardWidgetRenderer → [buildStatsCards, QueuesWidget, ActivityWidget, ChallengesWidget]
  ├─ Tab goals → GoalsDashboard → GoalsConfigDialog, CelebrationOverlay
  ├─ Tab ai → AIQuickAccess, AIStatsWidget, DemandPrediction, SentimentAlertsDashboard
  │                └─ SentimentHelpers, SentimentTabContent, SentimentTrendChart
  └─ Tab sla → SLAMetricsDashboard, ScheduledReportsManager, HealthScoreCard (RPC fn_system_health_score), RealtimeMetricsPanel
WarRoomDashboard (entrada separada)
  └─ war-room/{WarRoomAgentCard, WarRoomAlertRow, WarRoomMetricCard, WarRoomQueueRow}
GamificationEffects → MiniSparkline
ProgressiveDisclosureDashboard → DashboardSectionHeader
FloatingParticles (decorativo, 15 importadores)
```

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas e Views acessadas

| recurso | schema | via | arquivo |
|---|---|---|---|
| `messages` | zapp | `dbFrom('messages')` | ActivityHeatmap, ConversationHeatmap |
| `evolution_daily_metrics` | zapp (view) | `useDailyMetricsKpis` | DailyMetricsKpis |
| `business_hours` | zapp | `useBusinessHoursManagement` | BusinessHoursDialog, BusinessHoursIndicator |
| `away_messages` | zapp | `useBusinessHoursManagement` | BusinessHoursDialog |
| `audit_logs` | zapp | `useConnectionAuditLogs` | ConnectionAuditDialog |
| `whatsapp_connection_queues` | zapp | `useConnectionManagement` | ConnectionQueuesDialog |
| `queues`, `queue_members`, `queue_positions` | zapp | `useQueues` | ConnectionQueuesDialog |
| `whatsapp_official_credentials` | zapp | `fromTable` helper | OfficialApiConfigDialog |
| `whatsapp_official_credentials_safe` | zapp (view) | `fromTable` helper | OfficialApiConfigDialog |
| `reconnection_logs` | zapp | `safeFrom` | InstanceSettingsDialog |
| `scheduled_reports` | zapp | `useScheduledReports` | ScheduledReportsManager |
| `qr_attempts` | zapp | `useQrAttemptHistory` | QrAttemptHistory |

### RPCs

| RPC | chamador | arquivo |
|---|---|---|
| `fn_system_health_score` | `supabase.rpc()` direto | HealthScoreCard |
| `is_within_business_hours` | `useBusinessHoursManagement` | BusinessHoursDialog |

### Canais Realtime

| canal | schema | via | arquivo |
|---|---|---|---|
| `connection-alerts-*` | zapp | `useConnectionManagement` | ConnectionQueuesDialog |
| `queues-realtime:*` | zapp | `useQueues` | ConnectionQueuesDialog |

### Edge Functions invocadas

| função | via | arquivo |
|---|---|---|
| `connection-health-check` | `supabase.functions.invoke` | useConnectionCardActions (2×), DegradedQuickActions |
| `evolution-sync` | `supabase.functions.invoke` | ConnectionsView |
| `whatsapp-cloud-api` | `supabase.functions.invoke` | OfficialApiConfigDialog |

---

## 4. Exports Públicos por categoria

### connections/
- **Componentes de diálogo**: AddConnectionDialog, BusinessHoursDialog, ConnectionAuditDialog, ConnectionDisconnectDialog, ConnectionQueuesDialog, IdempotencyMissBanner, InstanceSettingsDialog, IntegrationsPanel, OfficialApiConfigDialog, QrAttemptHistory, QrCodeDialog
- **Componentes de card/indicador**: BusinessHoursIndicator, ConnectionCard, ConnectionCardMenu, ConnectionsStats, DegradedQuickActions, NumberReputationMonitor, QrCountdown, QrTtlBadge, RefreshQrButton
- **Componentes de vista**: BridgeSupabaseView, ConnectionsIntegrationsHub, ConnectionsView
- **Subcomponentes bridge**: BridgeInfoRow, BridgeStatCard, BridgeStatusBadge, InstanceSettingsTabContent
- **Utilitários/tipos**: connectionCardHelpers.ts, integrationsPanelFields.ts, integrationsPanelParts.tsx, types.ts (HubTab, BridgeStatus, HealthRow)
- **Hook**: useConnectionCardActions

### dashboard/
- **Componentes de widget/card**: AIQuickAccess, AIStatsWidget, ActivityHeatmap, AgentPerformancePanel, ConversationHeatmap, DailyMetricsKpis, DemandPrediction, FloatingParticles, GamificationEffects, GoalsDashboard, HealthScoreCard, MiniSparkline, RealtimeMetricsPanel, SLAMetricsDashboard, SatisfactionMetrics, ScheduledReportsManager
- **Componentes sentimento**: SentimentAlertsDashboard, SentimentHelpers, SentimentTabContent, SentimentTrendChart
- **War room**: WarRoomDashboard, war-room/{WarRoomAgentCard, WarRoomAlertRow, WarRoomMetricCard, WarRoomQueueRow}
- **Layout/estrutura**: DashboardFilters, DashboardSectionHeader, DashboardToolbar (MORTA), DashboardView, DashboardWidgetRenderer, GoalsConfigDialog, ProgressiveDisclosureDashboard

---

## 5. Chama (Saída)

### connections/
- **Hooks**: `useBusinessHoursManagement`, `useConnectionManagement`, `useConnectionAuditLogs`, `useQueues`, `useEvolutionApi`, `useEvolutionAutoSync`, `useEvolutionAutoReconnect`, `useMountedRef`, `useQrAttemptHistory`, `useNumberReputation`, `useIdempotencyMissAlerts`, `useBridgeHealth`, `useHubTabNavigation`, `use-toast`
- **Features**: `@/features/connections` (WhatsAppConnection, QrCodeDialogState), `@/features/auth` (useUserRole), `@/features/admin` (useAdminWhatsAppMode)
- **Libs**: `@/lib/logger`, `@/lib/utils` (cn), `@/lib/evolutionInstance`, `@/lib/supabaseHelpers` (fromTable), `@/lib/formatters` (formatTimeHMS), `@/lib/constants/whatsappInstances`, `safeClient`
- **Componentes externos**: `@/components/layout/PageHeader`, `@/components/effects/AuroraBorealis`, `@/components/integrations/IntegrationsHub`
- **Supabase**: `@/integrations/supabase/client`
- **Libs externas**: `sonner` (toast), `framer-motion`, `lucide-react`

### dashboard/
- **Hooks**: `useDashboardData`, `useDashboardWidgets`, `useAgentPerformanceRanking`, `useDailyMetricsKpis`, `useRealtimeDashboard`, `useSLAMetrics`, `useSentimentData`, `useSentimentAnalyses`, `useRealSentimentData`, `useWarRoomData`, `useWarRoomAlerts`, `useWarRoomMetrics`, `useScheduledReports`, `useGoalsConfig`, `useSaveGoals`, `useGoalsDashboard`, `useDemandPrediction`, `use-mobile`
- **Features**: `@/features/auth` (useAuth), `@/features/admin` (useAIStats, useAgents), `@/features/sla` (useSLAMetrics), `@/features/inbox` (AgentReassignmentPanel)
- **Services**: `@/services/api/queryKeys`, `@/integrations/datasource/db` (dbFrom)
- **Componentes externos**: `@/components/effects/Confetti`, `@/components/leaderboard/Leaderboard`, `@/components/gamification/*`, `@/components/csat/CSATDashboard`, `@/components/settings/SLAConfigurationManager` (lazy)
- **Libs externas**: `recharts`, `framer-motion`, `lucide-react`

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | contagem estimada |
|---|---|---|
| ConnectionsView.tsx | `src/lazyViews.ts` | 1 |
| ConnectionsIntegrationsHub.tsx | `ConnectionsView.tsx` | 1 (interno) |
| ConnectionCard.tsx | `ConnectionsView.tsx` | 1 (interno) |
| ConnectionCardMenu.tsx | `ConnectionCard.tsx` | 1 (interno) |
| OfficialApiConfigDialog.tsx | `useAdminWhatsAppMode.ts` (features/admin) | 1 externo |
| QrAttemptHistory.tsx | hooks + testes | 2+ |
| QrCodeDialog.tsx | `src/features/connections/hooks/` | 1+ |
| QrTtlBadge.tsx | `ConnectionsView.tsx` | 1 (interno) |
| RefreshQrButton.tsx | `ConnectionsView.tsx`, `QrCodeDialog.tsx` | 2 (internos) |
| BridgeSupabaseView.tsx | `ConnectionsIntegrationsHub.tsx` | 1 (interno) |
| bridge/BridgeInfoRow.tsx | `BridgeSupabaseView.tsx` | 1 (interno) |
| bridge/BridgeStatCard.tsx | `BridgeSupabaseView.tsx` | 1 (interno) |
| bridge/BridgeStatusBadge.tsx | `BridgeSupabaseView.tsx` | 1 (interno) |
| types.ts | `BridgeStatusBadge`, `useBridgeStatus`, rotas admin | 3+ |
| FloatingParticles.tsx | múltiplos (`ConnectionsView`, `DashboardView`, `AuroraBorealis`…) | ~15 |
| DashboardView.tsx | `src/lazyViews.ts`, `ViewRouter.tsx` | 2 externos |
| DashboardFilters.tsx | `DashboardView.tsx`, 5 hooks externos | 6 |
| ConversationHeatmap.tsx | `DashboardView.tsx`, 3 arquivos em `reports/` | 4 |
| DashboardSectionHeader.tsx | `ProgressiveDisclosureDashboard.tsx` | 1 |
| SentimentHelpers.tsx | `SentimentAlertsDashboard`, `SentimentTabContent`, `SentimentTrendChart` | 3 (internos) |
| MiniSparkline.tsx | `GamificationEffects.tsx` | 2 |
| GamificationEffects.tsx | `DashboardWidgetRenderer`, `DashboardView` | 2+ |
| WarRoomDashboard.tsx | rotas do app | 1+ |
| war-room/*.tsx | `WarRoomDashboard.tsx` | 1 cada (internos) |

---

## 7. Órfãos

| arquivo | linhas | veredito | motivo |
|---|---|---|---|
| AddConnectionDialog.tsx | 144 | SEGURO | Não importado por nenhum arquivo na codebase — nem ConnectionsView. Botão de criação de conexão não existe na UI atual. Candidato a remoção. |
| DashboardToolbar.tsx | 46 | SEGURO | MORTA: DashboardView usa `DashboardFilters` diretamente. `DashboardToolbar` não é importado por nenhum arquivo fora do diretório. |
| ConnectionsStats.tsx | 61 | VERIFICAR | Importado apenas pelo próprio teste unitário (`__tests__/ConnectionsStats.test.tsx`). ConnectionsView não usa os cards de estatística. Pode ter sido removido da UI intencionalmente ou teste órfão também. |
| QrCountdown.tsx | 43 | VERIFICAR | Importado somente por `ConnectionsView.tsx` (interno). Nenhum consumidor externo. Pequeno (43L), mas verifica se ainda está no template de QR. |
| DegradedQuickActions.tsx | 197 | VERIFICAR | Importado apenas por `ConnectionsView.tsx` (interno). Feature de "conexão degradada" pode estar ativa — verificar se ConnectionsView o renderiza condicionalmente. |
| NumberReputationMonitor.tsx | 160 | VERIFICAR | Importado somente por `ConnectionsView.tsx` (interno). Hook `useNumberReputation` é externo e completo. Sem importadores de fora. |
| IdempotencyMissBanner.tsx | 148 | VERIFICAR | Banner de admin, importado internamente em connections/. Hook `useIdempotencyMissAlerts` é externo. Zero uso fora do diretório. |
| InstanceSettingsDialog.tsx | 496 | NAO_REMOVER | Importado por `ConnectionCardMenu.tsx` (interno) — acionado pelo menu de ações do card. Órfão externo mas EM_USO funcional. |
| InstanceSettingsTabContent.tsx | 101 | NAO_REMOVER | Importado por `InstanceSettingsDialog.tsx` (interno). Sem importadores externos mas é parte do dialog de settings. |
| IntegrationsPanel.tsx | 326 | NAO_REMOVER | Importado por `ConnectionCardMenu.tsx` (interno). Gerencia 6 integrações WA. Órfão externo mas EM_USO funcional. |

---

## 8. Implementação por Arquivo

| arquivo | estado | o que falta |
|---|---|---|
| AddConnectionDialog.tsx | COMPLETA | — |
| BridgeSupabaseView.tsx | COMPLETA | — |
| BusinessHoursDialog.tsx | COMPLETA | — |
| BusinessHoursIndicator.tsx | COMPLETA | — |
| ConnectionAuditDialog.tsx | COMPLETA | — |
| ConnectionCard.tsx | COMPLETA | — |
| ConnectionCardMenu.tsx | COMPLETA | — |
| ConnectionDisconnectDialog.tsx | COMPLETA | — |
| ConnectionQueuesDialog.tsx | COMPLETA | — |
| ConnectionsIntegrationsHub.tsx | COMPLETA | — |
| ConnectionsStats.tsx | COMPLETA | — |
| ConnectionsView.tsx | COMPLETA | — |
| DegradedQuickActions.tsx | COMPLETA | — |
| IdempotencyMissBanner.tsx | COMPLETA | — |
| InstanceSettingsDialog.tsx | COMPLETA | — |
| InstanceSettingsTabContent.tsx | COMPLETA | — |
| IntegrationsPanel.tsx | COMPLETA | — |
| NumberReputationMonitor.tsx | COMPLETA | — |
| OfficialApiConfigDialog.tsx | COMPLETA | — |
| QrAttemptHistory.tsx | COMPLETA | — |
| QrCodeDialog.tsx | COMPLETA | — |
| QrCountdown.tsx | COMPLETA | — |
| QrTtlBadge.tsx | COMPLETA | — |
| RefreshQrButton.tsx | COMPLETA | — |
| __tests__/ConnectionsStats.test.tsx | COMPLETA | — |
| bridge/BridgeInfoRow.tsx | COMPLETA | — |
| bridge/BridgeStatCard.tsx | COMPLETA | — |
| bridge/BridgeStatusBadge.tsx | COMPLETA | — |
| connectionCardHelpers.ts | COMPLETA | — |
| integrationsPanelFields.ts | COMPLETA | — |
| integrationsPanelParts.tsx | COMPLETA | — |
| types.ts | COMPLETA | — |
| useConnectionCardActions.ts | COMPLETA | — |
| AIQuickAccess.tsx | COMPLETA | rotas `/voice-changer` e `/ai-summary` inexistentes |
| AIStatsWidget.tsx | COMPLETA | — |
| ActivityHeatmap.tsx | PARCIAL | métrica `resolutions` cai em branch errado sem erro |
| AgentPerformancePanel.tsx | COMPLETA | typo `messagessSent` (3×s) — campo provavelmente undefined |
| ConversationHeatmap.tsx | PARCIAL | `response_time` e `satisfaction` retornam zeros; só `volume` tem dados |
| DailyMetricsKpis.tsx | COMPLETA | — |
| DashboardFilters.tsx | COMPLETA | — |
| DashboardSectionHeader.tsx | COMPLETA | — |
| DashboardToolbar.tsx | MORTA | componente não renderizado em lugar algum |
| DashboardView.tsx | COMPLETA | XP/coins/streak hardcoded (1250/89/7) |
| DashboardWidgetRenderer.tsx | COMPLETA | eslint-disable global indica necessidade de split |
| DemandPrediction.tsx | COMPLETA | — |
| FloatingParticles.tsx | COMPLETA | — |
| GamificationEffects.tsx | COMPLETA | CSS vars `--xp`, `--coins`, `--streak`, `--rank-gold` precisam existir no tema |
| GoalsConfigDialog.tsx | COMPLETA | — |
| GoalsDashboard.tsx | COMPLETA | — |
| HealthScoreCard.tsx | COMPLETA | — |
| MiniSparkline.tsx | COMPLETA | — |
| ProgressiveDisclosureDashboard.tsx | COMPLETA | `EnhancedProgressiveDisclosure` sem importadores externos |
| RealtimeMetricsPanel.tsx | COMPLETA | — |
| SLAMetricsDashboard.tsx | COMPLETA | lazy import sem ErrorBoundary local |
| SatisfactionMetrics.tsx | STUB | `dataUnavailable = true` hardcoded; integrar avaliações reais |
| ScheduledReportsManager.tsx | COMPLETA | — |
| SentimentAlertsDashboard.tsx | COMPLETA | botão exportação permanentemente disabled |
| SentimentHelpers.tsx | COMPLETA | — |
| SentimentTabContent.tsx | COMPLETA | — |
| SentimentTrendChart.tsx | COMPLETA | prop `onExport` não implementada no chamador |
| WarRoomDashboard.tsx | COMPLETA | — |
| war-room/WarRoomAgentCard.tsx | COMPLETA | — |
| war-room/WarRoomAlertRow.tsx | COMPLETA | — |
| war-room/WarRoomMetricCard.tsx | COMPLETA | — |
| war-room/WarRoomQueueRow.tsx | COMPLETA | — |

---

## 9. Achados

### A1 — DashboardToolbar.tsx: componente morto, nunca renderizado
`src/components/dashboard/DashboardToolbar.tsx` — 46 linhas de toolbar (refresh/export/filter) que `DashboardView` não importa. `DashboardView` usa `DashboardFilters` diretamente. Componente completamente desconectado da UI. Remoção segura.

### A2 — AddConnectionDialog.tsx: botão de criação de conexão ausente da UI
`src/components/connections/AddConnectionDialog.tsx` — Modal de cadastro de nova conexão WA existe (144 linhas) mas não há nenhum importador no código-fonte. O botão "Conectar WhatsApp" visível na UI provavelmente está em outro componente ou nunca foi conectado.

### A3 — DashboardView.tsx: XP/coins/streak hardcoded
`src/components/dashboard/DashboardView.tsx:154-156` — Valores `xp=1250`, `coins=89`, `streak=7` embutidos no JSX. Dados de gamificação exibidos ao usuário são fictícios; não vêm de dados reais.

### A4 — ConversationHeatmap.tsx: métricas response_time e satisfaction sempre zero
`src/components/dashboard/ConversationHeatmap.tsx:~50` — O `queryFn` agrega apenas `count` de `messages.created_at`. Métricas `response_time` e `satisfaction` nunca são preenchidas, retornando zeros para o usuário sem indicação visual de indisponibilidade.

### A5 — SatisfactionMetrics.tsx: stub explícito sem TODO ou ticket rastreável
`src/components/dashboard/SatisfactionMetrics.tsx:24` — `const dataUnavailable = true` hardcoded. Botões de período desabilitados, nenhum hook de dados. Documentado no JSDoc como stub mas sem referência a issue ou data prevista.

### A6 — AgentPerformancePanel.tsx: typo no campo `messagessSent`
`src/components/dashboard/AgentPerformancePanel.tsx:~80` — `agent.messagessSent` (3 letras `s`) acessa propriedade provavelmente inexistente no objeto, resultando em `undefined` exibido silenciosamente no ranking.

### A7 — AIQuickAccess.tsx: rotas inexistentes
`src/components/dashboard/AIQuickAccess.tsx:93` — Navega para `/voice-changer` e `/ai-summary` que não existem como páginas registradas no router. Ação de `inbox` faz fallback para `'/'` quando deveria ser `/inbox`.

### A8 — ActivityHeatmap.tsx: métrica `resolutions` cai em branch errado
`src/components/dashboard/ActivityHeatmap.tsx:~60` — No switch de métricas, `resolutions` não tem case próprio e cai no branch `conversations`; exibe dados de conversas onde deveria exibir resoluções, sem erro visível.

### A9 — SentimentAlertsDashboard.tsx: exportação permanentemente bloqueada sem rastreabilidade
`src/components/dashboard/SentimentAlertsDashboard.tsx:22` — Botão com `disabled` e `opacity-50 cursor-not-allowed` hardcoded; feature não implementada sem TODO, FIXME ou referência a ticket.

### A10 — SentimentTrendChart.tsx: prop `onExport` nunca implementada no chamador
`src/components/dashboard/SentimentTrendChart.tsx:28` — O componente aceita `onExport` via prop e renderiza botão Download visível. `DashboardView` não passa o handler; botão não dispara nada útil.

### A11 — useConnectionCardActions.ts: sleep de 4s hardcoded entre restart e healthcheck
`src/components/connections/useConnectionCardActions.ts:47` — `await new Promise(r => setTimeout(r, 4000))` não configurável. Documentado com comentário de incidente (wpp2 2026-07-04), mas o atraso pode ser insuficiente em ambientes lentos ou excessivo em instâncias rápidas.

### A12 — Inconsistência de biblioteca de toast em connections/
`ConnectionQueuesDialog.tsx:9` usa `toast` de `sonner`; demais arquivos do diretório (`BusinessHoursDialog`, `ConnectionCard`) usam `@/hooks/use-toast`. Dois sistemas de toast no mesmo diretório geram comportamento visual inconsistente.

### A13 — OfficialApiConfigDialog.tsx: view `whatsapp_official_credentials_safe` fora dos tipos gerados
`src/components/connections/OfficialApiConfigDialog.tsx:77,151` — Acessa `whatsapp_official_credentials_safe` e `whatsapp_official_credentials` via `fromTable` helper porque não estão nos tipos TypeScript gerados. Regressão silenciosa possível se o schema mudar sem regeneração de tipos.

### A14 — GamificationEffects.tsx: CSS vars de gamificação podem não estar definidas
`src/components/dashboard/GamificationEffects.tsx` — Usa `hsl(var(--xp))`, `hsl(var(--coins))`, `hsl(var(--streak))`, `hsl(var(--rank-gold))`. Se o tema não definir essas variáveis, os badges ficam invisíveis sem erro no console.

### A15 — SLAMetricsDashboard.tsx: lazy import de SLAConfigurationManager sem ErrorBoundary local
`src/components/dashboard/SLAMetricsDashboard.tsx:1-2` — `lazy(() => import(...SLAConfigurationManager))` sem `<ErrorBoundary>` local. Falha de carregamento sobe para o boundary mais próximo na árvore, podendo derrubar toda a aba SLA.

### A16 — WarRoomDashboard.tsx: acoplamento cross-feature com inbox
`src/components/dashboard/WarRoomDashboard.tsx` — Importa `AgentReassignmentPanel` de `@/features/inbox`, criando acoplamento explícito entre war room (dashboard) e módulo de inbox. Qualquer refatoração de inbox afeta diretamente o painel operacional.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
