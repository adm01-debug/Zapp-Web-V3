# Estado: components/team-chat + components/monitoring

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 48/48

## 1. Visão Geral

Dois módulos distintos: **monitoring/** (24 arquivos) implementa o painel Evolution Monitoring Dashboard, sistema de DLQ e retry de webhooks. **team-chat/** (24 arquivos) implementa o chat interno da equipe com conversas, mensagens, departamentos e upload de mídia.

| arquivo | linhas | o que faz | EM_USO/ORFAO |
|---------|--------|-----------|--------------|
| monitoring/CrossTabDedupePanel.tsx | 169 | Deduplicação cross-tab via event bus in-memory + useSyncExternalStore | ORFAO |
| monitoring/DLQAuditHistory.tsx | 186 | Histórico de ações na DLQ (useDlqAuditLog → rpc_dlq_list_audit) | EM_USO |
| monitoring/DLQPanel.tsx | 302 | Painel DLQ com retry/abandon (rpc_dlq_retry_now, rpc_dlq_abandon) | EM_USO |
| monitoring/EvolutionMonitoringDashboard.tsx | 224 | Dashboard orquestrador; monta abas com todos os sub-painéis | EM_USO |
| monitoring/MonitoringAvailabilityHeatmap.tsx | 147 | Heatmap de disponibilidade últimos 30 dias (prop healthLogs) | EM_USO |
| monitoring/MonitoringConnectionsList.tsx | 191 | Lista conexões WA com restart/check via EF evolution-api | EM_USO |
| monitoring/MonitoringDiagnosticPanel.tsx | 268 | Diagnóstico com progress bar e export JSON local (sem servidor) | EM_USO |
| monitoring/MonitoringEventTimeline.tsx | 143 | Timeline de eventos via dbFrom('messages') + fetchConnectionHealthLogsTimeline | EM_USO |
| monitoring/MonitoringHealthLogs.tsx | 159 | Tabela filtrável de health logs (prop healthLogs) | EM_USO |
| monitoring/MonitoringMessageChart.tsx | 83 | Gráfico de área de mensagens por período (recharts) | EM_USO |
| monitoring/MonitoringSLAPanel.tsx | 149 | Métricas SLA de uptime por instância (props uptime, instanceUptimes) | EM_USO |
| monitoring/MonitoringStatsCards.tsx | 161 | Cards de estatísticas de conexões, msgs, uptime com sparklines | EM_USO |
| monitoring/MonitoringWebhookPanel.tsx | 373 | Painel de webhooks; orquestra DLQ + Retry + CrossTabDedupe | ORFAO |
| monitoring/MonitoringWebhookPanelTypes.ts | 65 | Tipos e constantes (SecretStatus, ALL_EXPECTED_EVENTS, EVENT_CATEGORIES) | EM_USO |
| monitoring/RetryAlertsBanner.tsx | 64 | Banner de alertas de retry por severidade (ícones) | ORFAO |
| monitoring/RetryAlertsConfig.tsx | 387 | Popover de configuração de thresholds de alerta de retry | ORFAO |
| monitoring/RetryMetricsPanel.tsx | 671 | KPIs, gráfico de barras e top reasons de retry (recharts) | ORFAO |
| monitoring/RetrySchedulePreview.tsx | 149 | Simulação de schedule de retry por instância | ORFAO |
| monitoring/hooks/\_\_tests\_\_/types.test.ts | 158 | Testa periodMs e periodBuckets de hooks/types.ts | EM_USO |
| monitoring/hooks/index.ts | 29 | Barrel: re-exporta useEvolutionMonitoring, useMonitoringNotifications, useRetryMetricsPanelState | EM_USO |
| monitoring/hooks/types.ts | 101 | Tipos de domínio (TimePeriod, ConnectionInfo, DiagnosticResult) | EM_USO |
| monitoring/hooks/useEvolutionMonitoring.ts | 125 | Hook principal de dados e ações de monitoramento Evolution | EM_USO |
| monitoring/hooks/useMonitoringNotifications.ts | 44 | Hook de notificações via getLogger; exportado no barrel sem consumidor | ORFAO |
| monitoring/useRetryMetricsPanelState.ts | 145 | State management e avaliação de thresholds do RetryMetricsPanel | ORFAO |
| team-chat/AddMembersDialog.tsx | 147 | Dialog para adicionar membros a conversa de grupo | EM_USO |
| team-chat/DepartmentManagementDialog.tsx | 115 | Dialog CRUD de departamentos | EM_USO |
| team-chat/MessageReactions.tsx | 237 | Barra de emoji-reactions com QUICK_EMOJIS e TeamQuickReactionBar | EM_USO |
| team-chat/NewConversationDialog.tsx | 275 | Dialog para criar nova conversa de equipe | EM_USO |
| team-chat/ParticipantStatsGraph.tsx | 80 | Gráfico Recharts de atividade de participantes | EM_USO |
| team-chat/TeamChatHeader.tsx | 280 | Cabeçalho do painel com nome, membros e ações | EM_USO |
| team-chat/TeamChatInputArea.tsx | 349 | Input com draft, anexos (TeamFileUploader) e emoji | EM_USO |
| team-chat/TeamChatMessageRow.tsx | 333 | Linha de mensagem individual — dead code pós-virtualização | ORFAO |
| team-chat/TeamChatPanel.tsx | 814 | Painel principal com lista virtual react-window | EM_USO |
| team-chat/TeamChatView.tsx | 107 | Vista-raiz roteada via lazyViews | EM_USO |
| team-chat/TeamConversationList.tsx | 257 | Sidebar de conversas com busca e filtro | EM_USO |
| team-chat/TeamFileUploader.tsx | 186 | Upload para bucket team-chat-files, gera URL assinada 7 dias | ORFAO |
| team-chat/TeamMemberDetails.tsx | 117 | Painel lateral de dados do membro da conversa (acordeão) | EM_USO |
| team-chat/TeamMemberProfileHeader.tsx | 173 | Cabeçalho de perfil com getRoleBadge e getBirthdayInfo | ORFAO |
| team-chat/TeamPerformancePanel.tsx | 229 | Painel de métricas LCP/INP/renderTime — dados 100% Math.random() | ORFAO |
| team-chat/TransferConversationDialog.tsx | 106 | Dialog para transferir conversa para outro departamento | EM_USO |
| team-chat/\_\_tests\_\_/team-chat-comprehensive.test.ts | 1635 | 270 cenários; 218 são expect(true).toBe(true) | EM_USO |
| team-chat/\_\_tests\_\_/team-chat-security-gaps.test.ts | 390 | 52 gaps de RLS — todos expect(true).toBe(true) | EM_USO |
| team-chat/department-management/DepartmentAuditView.tsx | 83 | Lista logs de auditoria do departamento | EM_USO |
| team-chat/department-management/DepartmentInvitesView.tsx | 87 | Lista e gerencia convites pendentes do departamento | EM_USO |
| team-chat/department-management/DepartmentMembersView.tsx | 141 | Lista membros com ações (promover/remover) | EM_USO |
| team-chat/department-management/DepartmentWhatsAppView.tsx | 196 | Configura modo WhatsApp do departamento | EM_USO |
| team-chat/teamChatParts.tsx | 143 | Utilitários: formatTime, formatDateSep, MediaContent, LockedDeptView | ORFAO |
| team-chat/useTeamChatPanel.ts | 372 | Hook central (envio, edição, reply, áudio, gravação, scroll, busca) | EM_USO |

---

## 2. Fluxos Funcionais

### Fluxo A — Evolution Monitoring Dashboard
`lazyViews.ts` → `EvolutionMonitoringDashboard` → `useEvolutionMonitoring` (hook) → `useMonitoringData` + `useMonitoringActions` → Realtime channel `monitoring-connections:{id}` sobre `zapp.whatsapp_connections` → sub-painéis: `MonitoringStatsCards`, `MonitoringConnectionsList`, `MonitoringAvailabilityHeatmap`, `MonitoringHealthLogs`, `MonitoringEventTimeline`, `MonitoringMessageChart`, `MonitoringSLAPanel`, `MonitoringDiagnosticPanel`.

### Fluxo B — DLQ / Dead Letter Queue
`AdminFailedMessagesPage` + `useFailedMessageAlerts` → `DLQPanel` (`useFailedMessages` → RPCs `rpc_list_failed_messages_cursor`, `rpc_dlq_retry_now`, `rpc_dlq_abandon`) → Realtime `zapp.failed_messages`. `DLQAuditHistory` → `useDlqAuditLog` → RPC `rpc_dlq_list_audit`.

### Fluxo C — Retry Metrics (ISOLADO / ORFAO)
`MonitoringWebhookPanel` → `RetryMetricsPanel` → `useRetryMetricsPanelState` → `@/lib/retryAlerts` → `RetryAlertsBanner`, `RetryAlertsConfig`, `RetrySchedulePreview`. Toda esta cadeia não tem importador externo detectado via grep — potencialmente morta.

### Fluxo D — Team Chat
`lazyViews.ts` → `TeamChatView` → `TeamConversationList` + `TeamChatPanel` (`useTeamChatPanel`) → hooks `useSendTeamMessage`, `useDeleteTeamMessage`, `useEditTeamMessage`, `useToggleMuteConversation` → tabelas `zapp.team_conversations`, `zapp.team_messages`. Upload de mídia via `TeamFileUploader` → bucket `team-chat-files`.

### Fluxo E — Gestão de Departamentos
`TeamConversationList` → `DepartmentManagementDialog` → abas: `DepartmentMembersView`, `DepartmentInvitesView`, `DepartmentAuditView`, `DepartmentWhatsAppView` (via `useDepartmentManagement`).

---

## 3. Tabelas, RPCs, canais realtime e edge functions

**Tabelas/views:**
- `zapp.failed_messages` — DLQPanel (via useFailedMessages), Realtime subscription
- `zapp.connection_health_logs` — MonitoringEventTimeline (via fetchConnectionHealthLogsTimeline)
- `zapp.whatsapp_connections` — useEvolutionMonitoring (Realtime)
- `zapp.team_conversations` — TransferConversationDialog (useTransferTeamConversation)
- `zapp.team_messages` — useTeamChatPanel (useSendTeamMessage, useDeleteTeamMessage, useEditTeamMessage, useUpdateTeamMessageStatus)
- `zapp.profiles` — TeamMemberDetails/TeamMemberProfileHeader (via hook)

**RPCs:**
- `rpc_dlq_list_audit` — DLQAuditHistory
- `rpc_list_failed_messages_cursor` — DLQPanel
- `rpc_dlq_retry_now`, `rpc_dlq_abandon`, `rpc_dlq_log_item_action` — DLQPanel

**Canais Realtime:**
- `schema: 'zapp', table: 'failed_messages'` — useFailedMessages (DLQPanel)
- `monitoring-connections:{random}` — useEvolutionMonitoring (broadcast sobre whatsapp_connections)

**Edge Functions:**
- `evolution-api` — MonitoringConnectionsList (via `supabase.functions.invoke` direto, nome hardcoded)

**Storage:**
- Bucket `team-chat-files` — TeamFileUploader (upload privado) + useTeamChatPanel (upload de áudio webm)

---

## 4. Exports Públicos por Categoria

**Componentes de dashboard (monitoring/):**
`EvolutionMonitoringDashboard`, `DLQPanel`, `DLQAuditHistory`

**Tipos amplamente consumidos (monitoring/):**
`MonitoringWebhookPanelTypes` (10 importadores externos), `hooks/types.ts` (10+ importadores)

**Hook de monitoramento:**
`useEvolutionMonitoring` (3 importadores externos: testes + RealtimeFanoutDebug)

**Componentes team-chat com importadores externos:**
`TeamChatView` (lazyViews + ViewRouter), `MessageReactions` (4 importadores: VirtualMessageBubble, ChatMessageBubble, features/inbox/index.ts)

**Cluster ORFAO (monitoring/):**
`MonitoringWebhookPanel`, `RetryMetricsPanel`, `RetryAlertsBanner`, `RetryAlertsConfig`, `RetrySchedulePreview`, `useRetryMetricsPanelState`, `CrossTabDedupePanel`, `useMonitoringNotifications`

---

## 5. Chama (Saída)

**monitoring/ consome:**
- `@/features/admin` — `useDlqAuditLog`, `useFailedMessages`, `useRetryMetrics`, `RetryMetricsFilters`
- `@/hooks/useConnectionHealthLogs` — `fetchConnectionHealthLogsTimeline`
- `@/hooks/monitoring/useMonitoringData`, `useMonitoringActions`
- `@/integrations/datasource/db` — `dbFrom` (MonitoringEventTimeline — origem incerta)
- `@/integrations/supabase/client` — `supabase`
- `@/lib/retryAlerts`, `@/lib/retryConfig`, `@/lib/retryScheduleSimulation`, `@/lib/devRealtimeLogger`
- `@/lib/evolutionInstance` — `evolutionInstanceName`
- `framer-motion`, `recharts`, `date-fns/locale/ptBR`

**team-chat/ consome:**
- `@/hooks/useTeamChat` — TeamConversation, TeamMessage, hooks de CRUD
- `@/hooks/useActiveDepartments`, `useParticipantStats`, `useUserSettings`, `useTeamChatDraft`, `useTeamChatNotifications`, `useTextToSpeech`, `useDebounce`, `usePerformanceMonitoring`
- `@/features/auth` — `useAuth`
- `@/features/inbox/hooks/team-chat/useTeamMessageReactions` — `AggregatedReaction`
- `@/features/inbox/components` — `MarkdownPreview`, `MessageStatus`
- `@/lib/storageSignedUrls`, `@/lib/logger`, `@/lib/utils`
- `@/services/api/queryKeys`
- `react-window` (lista virtualizada), `recharts`, `sonner`, `framer-motion`, `date-fns`

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | contagem |
|---------|-------------|---------|
| EvolutionMonitoringDashboard.tsx | src/pages/lazyViews.ts, ViewRouter.tsx | 2 |
| TeamChatView.tsx | src/pages/lazyViews.ts, ViewRouter.tsx | 2 |
| DLQAuditHistory.tsx | AdminFailedMessagesPage.tsx (externo), MonitoringWebhookPanel.tsx | 2 |
| DLQPanel.tsx | useFailedMessageAlerts.ts (externo), MonitoringWebhookPanel.tsx | 2 |
| MonitoringWebhookPanelTypes.ts | AdminWebhookSecretStatusPage, ViewRouter, lazyViews, queryKeys, adminWhatsAppModeTypes, useAdminWhatsAppMode, useAdminWebhookStatus, instanceAggregations, contract-schemas, AdminWhatsAppSecretsCard | 10 |
| hooks/types.ts | selfHostedDiagnostics, evolutionDiagnostics, whatsappStatusRepository, VoiceSearchOverlayConnected, NumberReputationMonitor, useEvolutionApiIntegration, useBridgeStatus, testes (+ 3) | 10+ |
| hooks/useEvolutionMonitoring.ts | realtimeFanout.test.ts, realtimeFanoutEvents.test.ts, RealtimeFanoutDebug.tsx | 3 |
| MessageReactions.tsx | VirtualMessageBubble.tsx, ChatMessageBubble.tsx, features/inbox/components/index.ts, + 1 | 4 |
| TeamMemberDetails.tsx | src/hooks/useTeamMemberDetails.ts (re-exporta tipo) | 1 |
| MonitoringWebhookPanel.tsx | **nenhum externo detectado** | 0 |
| CrossTabDedupePanel.tsx | MonitoringWebhookPanel.tsx (mesmo dir) | 0 ext |
| RetryMetricsPanel.tsx | **nenhum externo detectado** | 0 |
| RetryAlertsBanner/Config/SchedulePreview | RetryMetricsPanel.tsx (mesmo dir) | 0 ext |
| useMonitoringNotifications.ts | hooks/index.ts (mesmo dir; barrel sem consumidor externo) | 0 ext |
| useRetryMetricsPanelState.ts | RetryMetricsPanel.tsx (mesmo dir) | 0 ext |
| TeamChatMessageRow.tsx | **nenhum** | 0 |
| teamChatParts.tsx | TeamChatMessageRow.tsx (morto) | 0 ext |
| TeamFileUploader.tsx | TeamChatInputArea.tsx (mesmo dir) | 0 ext |
| TeamMemberProfileHeader.tsx | TeamMemberDetails.tsx (mesmo dir) | 0 ext |
| TeamPerformancePanel.tsx | TeamChatPanel.tsx (mesmo dir) | 0 ext |

---

## 7. Órfãos

Lista fechada de arquivos com zero importadores fora do próprio diretório:

### Cluster monitoring/ — VERIFICAR (8 arquivos, ~2.000 linhas)

| arquivo | tamanho | veredito | motivo |
|---------|---------|---------|--------|
| MonitoringWebhookPanel.tsx | 373L | VERIFICAR | 0 importadores externos detectáveis por grep; MonitoringWebhookPanelTypes é importado por ViewRouter/lazyViews — possível import dinâmico string-based não rastreável |
| CrossTabDedupePanel.tsx | 169L | VERIFICAR | único importador é MonitoringWebhookPanel (mesmo dir, orphan cascade) |
| RetryMetricsPanel.tsx | 671L | VERIFICAR | 0 importadores externos; usado exclusivamente por MonitoringWebhookPanel |
| RetryAlertsBanner.tsx | 64L | VERIFICAR | único importador é RetryMetricsPanel (orphan cascade) |
| RetryAlertsConfig.tsx | 387L | VERIFICAR | único importador é RetryMetricsPanel (orphan cascade) |
| RetrySchedulePreview.tsx | 149L | VERIFICAR | único importador é RetryMetricsPanel (orphan cascade) |
| useRetryMetricsPanelState.ts | 145L | VERIFICAR | único importador é RetryMetricsPanel (orphan cascade) |
| useMonitoringNotifications.ts | 44L | SEGURO | barrel-exportado por hooks/index.ts mas sem consumidor externo real; hook pequeno sem efeito colateral |

> **Atenção:** MonitoringWebhookPanelTypes.ts (10 importadores externos incluindo ViewRouter + lazyViews) sugere que MonitoringWebhookPanel pode ser montado via rota lazy não detectável por grep. Verificar lazyViews.ts por string `MonitoringWebhookPanel` antes de remover.

### team-chat/ dead code — SEGURO (2 arquivos, 476 linhas)

| arquivo | tamanho | veredito | motivo |
|---------|---------|---------|--------|
| TeamChatMessageRow.tsx | 333L | SEGURO | 0 importadores em qualquer lugar; TeamChatPanel renderiza mensagens inline com react-window sem usar este componente — dead code confirmado pós-refatoração de virtualização |
| teamChatParts.tsx | 143L | SEGURO | único importador é TeamChatMessageRow (dead code); helpers formatTime/MediaContent/LockedDeptView nunca alcançados |

### team-chat/ helpers internos — NAO_REMOVER (3 arquivos)

| arquivo | tamanho | veredito | motivo |
|---------|---------|---------|--------|
| TeamFileUploader.tsx | 186L | NAO_REMOVER | único importador é TeamChatInputArea (mesmo dir) mas faz parte da cadeia ativa TeamChatView → TeamChatPanel → TeamChatInputArea |
| TeamMemberProfileHeader.tsx | 173L | NAO_REMOVER | único importador é TeamMemberDetails (mesmo dir) que tem importador externo (useTeamMemberDetails.ts) |
| TeamPerformancePanel.tsx | 229L | NAO_REMOVER | único importador é TeamChatPanel (mesmo dir, ativo); stub com dados mock — não remover sem implementar substituto real |

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| CrossTabDedupePanel.tsx | COMPLETA | — |
| DLQAuditHistory.tsx | COMPLETA | — |
| DLQPanel.tsx | COMPLETA | — |
| EvolutionMonitoringDashboard.tsx | COMPLETA | — |
| MonitoringAvailabilityHeatmap.tsx | COMPLETA | — |
| MonitoringConnectionsList.tsx | COMPLETA | — |
| MonitoringDiagnosticPanel.tsx | COMPLETA | — |
| MonitoringEventTimeline.tsx | PARCIAL | dbFrom('messages') com origem incerta; sem paginação (max 30 eventos hardcoded) |
| MonitoringHealthLogs.tsx | COMPLETA | — |
| MonitoringMessageChart.tsx | COMPLETA | — |
| MonitoringSLAPanel.tsx | COMPLETA | — |
| MonitoringStatsCards.tsx | COMPLETA | — |
| MonitoringWebhookPanel.tsx | COMPLETA | — |
| MonitoringWebhookPanelTypes.ts | COMPLETA | — |
| RetryAlertsBanner.tsx | COMPLETA | — |
| RetryAlertsConfig.tsx | COMPLETA | — |
| RetryMetricsPanel.tsx | COMPLETA | — |
| RetrySchedulePreview.tsx | COMPLETA | — |
| hooks/\_\_tests\_\_/types.test.ts | COMPLETA | Verificar se está no include do vitest.config.ts |
| hooks/index.ts | COMPLETA | Consolidação pendente com features/admin/hooks/monitoring/ (REFACTORING.md §3.6) |
| hooks/types.ts | COMPLETA | — |
| hooks/useEvolutionMonitoring.ts | COMPLETA | — |
| hooks/useMonitoringNotifications.ts | COMPLETA | — |
| useRetryMetricsPanelState.ts | COMPLETA | — |
| AddMembersDialog.tsx | COMPLETA | — |
| DepartmentManagementDialog.tsx | COMPLETA | — |
| MessageReactions.tsx | COMPLETA | — |
| NewConversationDialog.tsx | COMPLETA | — |
| ParticipantStatsGraph.tsx | COMPLETA | — |
| TeamChatHeader.tsx | COMPLETA | — |
| TeamChatInputArea.tsx | COMPLETA | — |
| TeamChatMessageRow.tsx | MORTA | Dead code; substituída por renderização inline no TeamChatPanel |
| TeamChatPanel.tsx | COMPLETA | — |
| TeamChatView.tsx | COMPLETA | — |
| TeamConversationList.tsx | COMPLETA | — |
| TeamFileUploader.tsx | COMPLETA | MIME type não validado (bucket team-chat-files não tem allowed_mime_types) |
| TeamMemberDetails.tsx | COMPLETA | — |
| TeamMemberProfileHeader.tsx | COMPLETA | — |
| TeamPerformancePanel.tsx | STUB | Dados são Math.random(); nenhuma coleta real de LCP/INP/renderTime |
| TransferConversationDialog.tsx | PARCIAL | transferred_by hardcoded 'Support Agent' — nunca usa usuário autenticado |
| \_\_tests\_\_/team-chat-comprehensive.test.ts | MORTA | 218/270 testes são expect(true).toBe(true); cobertura real = 0 |
| \_\_tests\_\_/team-chat-security-gaps.test.ts | MORTA | 52/52 testes são expect(true).toBe(true); documenta gaps mas não os verifica |
| department-management/DepartmentAuditView.tsx | COMPLETA | — |
| department-management/DepartmentInvitesView.tsx | COMPLETA | — |
| department-management/DepartmentMembersView.tsx | COMPLETA | — |
| department-management/DepartmentWhatsAppView.tsx | COMPLETA | — |
| teamChatParts.tsx | MORTA | Só consumida por TeamChatMessageRow (dead code) |
| useTeamChatPanel.ts | COMPLETA | — |

---

## 9. Achados

### A1 — MonitoringWebhookPanel orphan por limitação de grep
`monitoring/MonitoringWebhookPanel.tsx` tem 0 importadores detectáveis por grep estático. Porém `MonitoringWebhookPanelTypes.ts` é importado por `ViewRouter` e `lazyViews` (10 importadores externos). Lazyviews usa import dinâmico string-based (`() => import('...')`) que grep não detecta. **Verificar lazyViews.ts** antes de tratar como dead code — o componente pode estar ativo em rota de admin.

### A2 — TeamChatMessageRow: dead code confirmado (333L + 143L removíveis)
`team-chat/TeamChatMessageRow.tsx:4` — `TeamChatPanel.tsx` refatorou para react-window com renderização inline de mensagens sem usar `TeamChatMessageRow`. O componente não tem nenhum importador. `teamChatParts.tsx` (helpers de formatação) só é importado por `TeamChatMessageRow` → cascata morta. Total: 476 linhas removíveis sem risco.

### A3 — Testes fantasma: cobertura ilusória de CI
`team-chat/__tests__/team-chat-comprehensive.test.ts` — 218 de 270 testes são literalmente `expect(true).toBe(true)`. CI sempre verde. Cenários cobertos incluem "autenticação", "injeção SQL", "autorização" — todos passam trivialmente.
`team-chat/__tests__/team-chat-security-gaps.test.ts` — 52 testes, todos `expect(true)`. Documenta gaps reais de RLS (INSERT em `team_messages` sem checagem de membership, ausência de DELETE policy em `team_conversations`) mas não executa nenhuma asserção. Os bugs descritos podem existir em produção sem ser detectados.

### A4 — TeamPerformancePanel: stub em produção com dados aleatórios
`team-chat/TeamPerformancePanel.tsx:41-55` — `useEffect` preenche métricas `lcp`, `inp`, `renderTime`, `memoryUsage` com `Math.random() * 100`. O painel aparece como feature real no TeamChatPanel. Qualquer decisão baseada nestes números é baseada em ruído aleatório. Risco: usuário toma decisão operacional com dado falso.

### A5 — TransferConversationDialog: campo de auditoria hardcoded
`team-chat/TransferConversationDialog.tsx:46` — `transferred_by: 'Support Agent'` fixo no payload. Nunca usa o usuário autenticado (`useAuth`). Logs de transferência em `zapp.team_conversations` são inauditáveis — impossível rastrear quem transferiu uma conversa.

### A6 — MonitoringEventTimeline: datasource abstrato de origem incerta
`monitoring/MonitoringEventTimeline.tsx:44` — usa `dbFrom('messages')` (abstração de datasource genérica de `@/integrations/datasource/db`). Não está claro se aponta para `evo.evolution_messages` ou tabela em `zapp`. Slice hardcoded de 30 eventos sem paginação.

### A7 — useFailedMessages: cast para contornar tipos gerados
`@/features/admin/hooks/useFailedMessages.ts:37` (importado por DLQPanel) — usa cast `@ts-ignore` / `ignore-audit` para contornar ausência dos RPCs DLQ nos tipos gerados em `types.ts`. Indica que RPCs `rpc_dlq_*` não foram regenerados nos tipos TypeScript do banco.

### A8 — MonitoringConnectionsList: Edge Function por nome hardcoded
`monitoring/MonitoringConnectionsList.tsx:42,64` — `supabase.functions.invoke('evolution-api', ...)` sem wrapper. Se a Edge Function for renomeada ou deprecada, quebra silenciosamente em runtime sem erro de compilação.

### A9 — hooks/index.ts: consolidação de monitoring pendente
`monitoring/hooks/index.ts:24` — comentário menciona `REFACTORING.md §3.6`: plano de consolidar `monitoring/hooks/` com `features/admin/hooks/monitoring/`. Pendente. Duplicação de responsabilidades entre os dois locais.

### A10 — Team-chat-files bucket sem validação de MIME type
`team-chat/TeamFileUploader.tsx:69` — upload para bucket `team-chat-files` sem especificar `contentType`. `useTeamChatPanel.ts:238-243` faz upload de `audio/webm` para o mesmo bucket. O bucket não tem `allowed_mime_types` definido (diferente de `audio-messages` e `whatsapp-media`). Qualquer tipo de arquivo pode ser enviado ao bucket privado.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
