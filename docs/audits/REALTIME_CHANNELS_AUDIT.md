# REALTIME_CHANNELS_AUDIT — varredura de canais realtime em `src/`

> **Nenhum arquivo tem `.on()` após `.subscribe()` — diagnóstico A refutado; o vetor real de crash é reuso de topic estático (BUG #1 fixado em `useAgents.ts` pelo Worker 1).**

## Metadados

| Campo | Valor |
|---|---|
| Data | 2026-08-05 |
| Escopo | `src/` (`*.ts`, `*.tsx`) — excluídos testes (`*.test.*`, `*.spec.*`, `__tests__`, `/tests`) e `node_modules` |
| Comando | `grep -rn '.channel(' src --include=*.ts --include=*.tsx` |
| Chamadas `.channel(` encontradas | **83** |
| Topics na tabela (inclui 1 const de topic estático sem `.channel(` literal + 1 linha de comentário) | **84** |
| Arquivos SEM `removeChannel` | 2 — **corrigidos nesta rodada** (safe-queries.ts, settingsRepository.ts) |
| Violações `.on()` após `.subscribe()` | **0** (todas as cadeias usam `.on()`/`.on<T>()` antes de `.subscribe()`) |

## Fix aplicado nesta rodada (leak de canais — Worker 3)

Dois arquivos criavam canais e **nunca** os removiam do cliente (`supabase.channels` cresce a cada subscribe — sem `removeChannel` em lugar nenhum do arquivo).

| Arquivo | Linha | Canal | Fix |
|---|---|---|---|
| `src/integrations/supabase/safe-queries.ts` | 113 | `whatsapp_connections_safe` | disposer `channel.dispose?.()` anexado (retrocompatível — retorno continua `RealtimeChannel`) |
| `src/integrations/supabase/safe-queries.ts` | 171 | `channel_connections_safe` | disposer `channel.dispose?.()` anexado |
| `src/services/settings/settingsRepository.ts` | 151 | `user_settings:${userId}` | disposer `channel.dispose?.()` anexado |
| `src/services/settings/settingsRepository.ts` | 165 | `workspace_settings:${workspaceId}` | disposer `channel.dispose?.()` anexado |

O disposer executa o padrão de cleanup do repo: `channel.unsubscribe()` + `supabase.removeChannel(channel)`. **Assinaturas públicas não foram alteradas** (as funções continuam retornando o `RealtimeChannel`); o cleanup é exposto de forma retrocompatível como `channel.dispose?.()` no objeto retornado, documentado via comentário nos dois arquivos. Verificação: `grep -c removeChannel` → safe-queries.ts = 3, settingsRepository.ts = 3 (≥ 1 cada). Nenhum caller atual usa esses `subscribe` (latente — `safeWhatsAppConnectionsQuery`/`safeChannelConnectionsQuery` só usam `getList/getById/getByIds/getDegraded/getSummary`; `subscribeTo*Settings` só repassado por `settingsService.on*SettingsChange`, sem callers em produção).

## Backlog — topics estáticos de maior risco (NÃO alterados nesta rodada)

Topics estáticos priorizados pela coordenação (mesmo vetor do BUG #1: `supabase.channel(topic estático)` devolve a MESMA instância enquanto o teardown assíncrono não termina → subscribe duplicado/crash em remount ou multi-mount). **Não alterados nesta rodada** — correção segue o padrão do Worker 1 (topic único por mount + `unsubscribe`/`removeChannel` no cleanup):

| Arquivo:linha | Topic estático |
|---|---|
| `src/hooks/useNotificationManagement.ts:362` | `notifications:team-chat` |
| `src/hooks/useNotificationManagement.ts:410` | `notifications:security` |
| `src/hooks/useNotificationManagement.ts:441` | `notifications:goals` |
| `src/hooks/useNotificationManagement.ts:474` | `notifications:transcription` |
| `src/hooks/useAudioManagement.ts:152` | `audio-memes-catalog` |
| `src/hooks/useAudioManagement.ts:167` | `audio-memes-favorites` |
| `src/hooks/useConnectionStatusIndicator.ts:147` | `connection-status-indicator` |
| `src/hooks/useIncomingCallListener.ts:28` | `incoming-calls` |
| `src/hooks/useBridgeStatus.ts:227` | `traffic-changes` |
| `src/hooks/useBridgeStatus.ts:242` | `health-incidents` |
| `src/hooks/useWarRoomAlerts.ts:46` | `warroom-alerts-realtime` |
| `src/features/sla/hooks/useSLANotifications.ts:81` | `sla-breaches` |
| `src/hooks/useRealtimeSentimentAlerts.ts:13` | `sentiment-alerts-realtime` |
| `src/hooks/useSecurityAuditLogs.ts:145` | `security_logs_realtime` |
| `src/hooks/useACLAlerts.ts:51` | `security_acl_alerts_realtime` |
| `src/features/inbox/hooks/team-chat/useTeamConversations.ts:137` | `team-chat-updates` |
| `src/features/inbox/hooks/useRealtimeMessages.ts:648` | `messages-realtime` (const `channelName` — canal estável por sessão, F4-03) |

A varredura encontrou também topics estáticos **multi-mount** fora do backlog coordenado, mesma classe de risco (marcados 🔴 na tabela, **não alterados**): `useFailedMessages.ts:166`, `useRetryMetrics.ts:124`, `useRateLimitLogs.ts:172`, `useEvolutionMonitoring.ts:81`, `useEvolutionAutoReconnect.ts:214`, `useGmailOAuthFlow.ts:305`.

## Tabela completa dos canais realtime (84 linhas)

Legenda: **topic único?** = sim se contém `Math.random` ou template string interpolada (ou variável); **.on() antes de .subscribe()?** = ordem da cadeia (`.on<T>()` genérico conta como sim); **removeChannel?** = existe `removeChannel` no arquivo (cleanup); **multi-mount?** = 1 se o hook/componente é consumido por ≥2 componentes (imports diretos ou cadeias de re-export); **risco** = 🔴 topic estático (backlog coordenado ou multi-mount), 🟠 topic estático single-mount, 🟢 topic único.

| Topic | Arquivo:linha | Topic único? | .on() antes de .subscribe()? | removeChannel? | multi-mount? | Risco |
|---|---|---|---|---|---|---|
| `'degraded-banner'` | `src/components/alerts/DegradedConnectionsBanner.tsx:54` | não | sim | sim | 0 | 🟠 |
| `'health-updates'` | `src/components/diagnostics/ConnectionHealthPanel.tsx:86` | não | sim | sim | 0 | 🟠 |
| `'monitoring-connections'` | `src/components/monitoring/hooks/useEvolutionMonitoring.ts:81` | não | sim | sim | 1 | 🔴 |
| `'payment-links-changes'` | `src/components/payments/PaymentLinksView.tsx:60` | não | sim | sim | 0 | 🟠 |
| `'password-reset-requests'` | `src/components/security/PasswordResetRequestsPanel.tsx:47` | não | sim | sim | 0 | 🟠 |
| `'security-alerts'` | `src/components/security/RateLimitRealtimeAlerts.tsx:79` | não | sim | sim | 0 | 🟠 |
| ``talkx-monitor-${campaignId}`` | `src/components/talkx/TalkXLiveMonitor.tsx:45` | sim | sim | sim | 0 | 🟢 |
| `'talkx-realtime'` | `src/components/talkx/TalkXView.tsx:93` | não | sim | sim | 0 | 🟠 |
| `'qr-attempts-admin'` | `src/features/admin/components/QrAttemptsPanel.tsx:103` | não | sim | sim | 0 | 🟠 |
| `'failed_messages_realtime'` | `src/features/admin/hooks/monitoring/useFailedMessages.ts:166` | não | sim | sim | 1 | 🔴 |
| `'evolution_retry_metrics_realtime'` | `src/features/admin/hooks/monitoring/useRetryMetrics.ts:124` | não | sim | sim | 1 | 🔴 |
| `channelName` (variável) | `src/features/admin/hooks/useAgents.ts:74` | sim | sim | sim | 1 | 🟢 |
| `'rate-limit-logs'` | `src/features/admin/hooks/useRateLimitLogs.ts:172` | não | sim | sim | 1 | 🔴 |
| ``profile-updates-${user.id}`` | `src/features/auth/components/AuthProvider.tsx:491` | sim | sim | sim | 0 | 🟢 |
| ``roles-updates-${user.id}`` | `src/features/auth/components/AuthProvider.tsx:508` | sim | sim | sim | 0 | 🟢 |
| `'deals-changes'` | `src/features/business-logic/hooks/useBusinessLogicManagement.ts:461` | não | sim | sim | 0 | 🟠 |
| *(comentário)* `supabase.channel(topic)` | `src/features/connections/hooks/parts/useConnectionsRealtime.ts:11` | — | — | sim | 0 | — |
| `channelName` (variável) | `src/features/connections/hooks/parts/useConnectionsRealtime.ts:50` | sim | sim | sim | 0 | 🟢 |
| ``typing:${remoteJid}`` | `src/features/contacts/hooks/useContactTyping.ts:145` | sim | sim | sim | 1 | 🟢 |
| `'leaderboard-updates'` | `src/features/dashboard/hooks/useDashboardVisualizationManagement.ts:739` | não | sim | sim | 0 | 🟠 |
| ``whisper-${contactId}`` | `src/features/inbox/components/WhisperMode.tsx:96` | sim | sim | sim | 0 | 🟢 |
| ``chat-updates:${contactJid}`` | `src/features/inbox/components/chat/ChatMessagesArea.tsx:174` | sim | sim | sim | 0 | 🟢 |
| ``conversation:${contactId}`` | `src/features/inbox/components/collaboration/ViewersIndicator.tsx:29` | sim | sim | sim | 0 | 🟢 |
| ``transcription-${messageId}`` | `src/features/inbox/components/useAudioMessagePlayer.ts:56` | sim | sim | sim | 0 | 🟢 |
| ``voice-conversion-${messageId}`` | `src/features/inbox/components/useAudioMessagePlayer.ts:87` | sim | sim | sim | 0 | 🟢 |
| ``conv-reactions:${conversationId}`` | `src/features/inbox/hooks/reactions/useConversationReactionsRealtime.ts:32` | sim | sim | sim | 0 | 🟢 |
| `'automation_executions_failure_alerts'` | `src/features/inbox/hooks/realtime/useAutomationFailureAlerts.ts:104` | não | sim | sim | 0 | 🟠 |
| `'failed_messages_alerts'` | `src/features/inbox/hooks/realtime/useFailedMessageAlerts.ts:54` | não | sim | sim | 0 | 🟠 |
| `channelName` (variável) | `src/features/inbox/hooks/realtime/useRealtimeContacts.ts:265` | sim | sim | sim | 0 | 🟢 |
| `'retry_resolution_alerts'` | `src/features/inbox/hooks/realtime/useRetryResolutionAlerts.ts:151` | não | sim | sim | 0 | 🟠 |
| `'team-chat-updates'` | `src/features/inbox/hooks/team-chat/useTeamConversations.ts:137` | não | sim | sim | 0 | 🔴 |
| ``team-reactions-${conversationId}`` | `src/features/inbox/hooks/team-chat/useTeamMessageReactions.ts:55` | sim | sim | sim | 0 | 🟢 |
| ``team-messages-${conversationId}`` | `src/features/inbox/hooks/team-chat/useTeamMessages.ts:72` | sim | sim | sim | 0 | 🟢 |
| `topic` (variável) | `src/features/inbox/hooks/useIncomingCallBroadcast.ts:36` | sim | sim | sim | 0 | 🟢 |
| ``reactions:${messageId}`` | `src/features/inbox/hooks/useMessageReactions.ts:27` | sim | sim | sim | 0 | 🟢 |
| ``message-status-${contactId}`` | `src/features/inbox/hooks/useMessageStatus.ts:91` | sim | sim | sim | 0 | 🟢 |
| ``evolution_messages:${remoteJid}`` | `src/features/inbox/hooks/useMessagesCursor.ts:226` | sim | sim | sim | 0 | 🟢 |
| ``whisper-count-${selectedContactId}`` | `src/features/inbox/hooks/useRealtimeInbox.ts:276` | sim | sim | sim | 1 | 🟢 |
| `'sla-breaches'` | `src/features/sla/hooks/useSLANotifications.ts:81` | não | sim | sim | 0 | 🔴 |
| `'security_acl_alerts_realtime'` | `src/hooks/useACLAlerts.ts:51` | não | sim | sim | 0 | 🔴 |
| `'warroom-alerts-management'` | `src/hooks/useAlertManagement.ts:150` | não | sim | sim | 0 | 🟠 |
| `channelName` (variável) | `src/hooks/useAlertManagement.ts:410` | sim | sim | sim | 0 | 🟢 |
| `'audio-memes-catalog'` | `src/hooks/useAudioManagement.ts:152` | não | sim | sim | 1 | 🔴 |
| `'audio-memes-favorites'` | `src/hooks/useAudioManagement.ts:167` | não | sim | sim | 1 | 🔴 |
| `'automation-executions-audit'` | `src/hooks/useAutomationLogs.ts:83` | não | sim | sim | 0 | 🟠 |
| ``automation-exec-${contactId}`` | `src/hooks/useAutomationManagement.ts:441` | sim | sim | sim | 0 | 🟢 |
| ``automation-suggestions-${contactId}`` | `src/hooks/useAutomationSuggestions.ts:93` | sim | sim | sim | 0 | 🟢 |
| `'traffic-changes'` | `src/hooks/useBridgeStatus.ts:227` | não | sim | sim | 0 | 🔴 |
| `'health-incidents'` | `src/hooks/useBridgeStatus.ts:242` | não | sim | sim | 0 | 🔴 |
| ``connection-alerts-${auth.user.id}`` | `src/hooks/useConnectionAlertsPush.ts:20` | sim | sim | sim | 0 | 🟢 |
| ``connection-alerts-${auth.user.id}`` | `src/hooks/useConnectionManagement.ts:52` | sim | sim | sim | 0 | 🟢 |
| `'connection-status-indicator'` | `src/hooks/useConnectionStatusIndicator.ts:147` | não | sim | sim | 0 | 🔴 |
| ``email-threads-${activeAccountId}`` | `src/hooks/useEmail.ts:673` | sim | sim | sim | 1 | 🟢 |
| ``email-threads-email-${activeAccountId}`` | `src/hooks/useEmailManagement.ts:789` | sim | sim | sim | 0 | 🟢 |
| `'evolution-reconnect-monitor'` | `src/hooks/useEvolutionAutoReconnect.ts:214` | não | sim | sim | 1 | 🔴 |
| `'email_accounts_changes'` | `src/hooks/useGmailOAuthFlow.ts:305` | não | sim | sim | 1 | 🔴 |
| `'incoming-calls'` | `src/hooks/useIncomingCallListener.ts:28` | não | sim | sim | 0 | 🔴 |
| `'notifications:team-chat'` | `src/hooks/useNotificationManagement.ts:362` | não | sim | sim | 1 | 🔴 |
| `'notifications:security'` | `src/hooks/useNotificationManagement.ts:410` | não | sim | sim | 1 | 🔴 |
| `'notifications:goals'` | `src/hooks/useNotificationManagement.ts:441` | não | sim | sim | 1 | 🔴 |
| `'notifications:transcription'` | `src/hooks/useNotificationManagement.ts:474` | não | sim | sim | 1 | 🔴 |
| `channelName.current` (variável) | `src/hooks/useQueues.ts:139` | sim | sim | sim | 1 | 🟢 |
| ``dashboard:${dashboardId}`` | `src/hooks/useRealtimeManagement.ts:27` | sim | sim | sim | 0 | 🟢 |
| ``chat:${chatId}`` | `src/hooks/useRealtimeManagement.ts:132` | sim | sim | sim | 0 | 🟢 |
| ``monitor:${schema}:${tableName}`` | `src/hooks/useRealtimeManagement.ts:165` | sim | sim | sim | 0 | 🟢 |
| ``typing:${chatId}`` | `src/hooks/useRealtimeManagement.ts:205` | sim | sim | sim | 0 | 🟢 |
| `channelId.current` (variável) | `src/hooks/useRealtimeMessages.ts:224` | sim | sim | sim | 0 | 🟢 |
| `'sentiment-alerts-realtime'` | `src/hooks/useRealtimeSentimentAlerts.ts:13` | não | sim | sim | 0 | 🔴 |
| `'security_logs_realtime'` | `src/hooks/useSecurityAuditLogs.ts:145` | não | sim | sim | 0 | 🔴 |
| `'transcription-notifications'` | `src/hooks/useTranscriptionNotifications.ts:35` | não | sim | sim | 0 | 🟠 |
| ``typing-presence-${conversationId}`` | `src/hooks/useTypingPresence.ts:43` | sim | sim | sim | 0 | 🟢 |
| `'warroom-alerts-realtime'` | `src/hooks/useWarRoomAlerts.ts:46` | não | sim | sim | 0 | 🔴 |
| ``${name}:${dbTable(entity)}`` | `src/integrations/datasource/db.ts:73` | sim | sim (call sites) | sim | 0 | 🟢 |
| `'whatsapp_connections_safe'` | `src/integrations/supabase/safe-queries.ts:113` | não | sim | sim (disposer — fix nesta rodada) | 0 | 🟠 |
| `'channel_connections_safe'` | `src/integrations/supabase/safe-queries.ts:171` | não | sim | sim (disposer — fix nesta rodada) | 0 | 🟠 |
| ``zapp:conversations:${instance}`` | `src/integrations/zappweb/hooks/useZappConversations.ts:56` | sim | sim | sim | 0 | 🟢 |
| ``zapp:messages:${instance}:${remoteJid}`` | `src/integrations/zappweb/hooks/useZappMessages.ts:61` | sim | sim | sim | 0 | 🟢 |
| `channelId.current` (variável) | `src/pages/AdminAlertHistoryPage.tsx:101` | sim | sim | sim | 0 | 🟢 |
| `'hmac-selftest-audit-realtime'` | `src/pages/admin-webhook-secret-status/useHmacAuditHistory.ts:70` | não | sim | sim | 0 | 🟠 |
| `'email-admin-status'` | `src/pages/admin/email/useEmailHealthStatus.ts:81` | não | sim | sim | 0 | 🟠 |
| ``${tableName}-changes:${Math.random().toString(36).slice(2, 10)}`` | `src/services/api/genericService.ts:250` | sim | sim | sim | 0 | 🟢 |
| ``user_settings:${userId}`` | `src/services/settings/settingsRepository.ts:151` | sim | sim | sim (disposer — fix nesta rodada) | 0 | 🟢 |
| ``workspace_settings:${workspaceId}`` | `src/services/settings/settingsRepository.ts:165` | sim | sim | sim (disposer — fix nesta rodada) | 0 | 🟢 |
| `'messages-realtime'` (const `channelName` — sem `.channel(` literal; criado via `dbChannel('messages', channelName)` em :670) | `src/features/inbox/hooks/useRealtimeMessages.ts:648` | não | sim | sim | 0 | 🔴 |

## Notas

- **BUG #1 (referência):** `useAgents.ts:74` agora usa topic único por mount — `` `agent-presence-realtime:${Math.random().toString(36).slice(2, 10)}` `` — com `unsubscribe()` + `removeChannel()` no cleanup do effect (fix do Worker 1).
- `useRealtimeMessages.ts` tem 2 subscriptions de mensagens: :224 (topic único por mount via ref com `Math.random`) e :648 (const estática `messages-realtime`, estável por sessão — item de backlog).
- `src/integrations/datasource/db.ts:73` é factory (`dbChannel`) — `.on()`/`.subscribe()` acontecem nos call sites; expõe `dbRemoveChannel` para cleanup.
- Linha 11 de `useConnectionsRealtime.ts` é comentário (grep hit) — sem canal real.
- 84 linhas = 83 hits de grep + 1 const de topic (`useRealtimeMessages.ts:648`); a linha de comentário está incluída e sinalizada.

**Resumo:** 83 chamadas `.channel(` / 0 violações de ordem / 2 arquivos com leak de canal corrigidos (4 canais com disposer) / 17 topics estáticos no backlog coordenado + 6 multi-mount adicionais identificados (não alterados).
