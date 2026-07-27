# Inventário de Canais Realtime

## Tabelas Subscritas no Frontend (34 canais únicos)

| Canal (schema.table) | Status na Publication | Arquivo de Subscription |
|---------------------|----------------------|------------------------|
| `email_app.email_accounts` | ✅ Adicionado em `20260724000006` | `useGmailOAuthFlow.ts:292` |
| `email_app.email_health_summary` | ✅ Adicionado via migration | `useEmailManagement.ts` |
| `email_app.email_revalidation_jobs` | ⚠️ Verificar | `useEmail.ts:597` |
| `evo.evolution_messages` | ✅ `evo.evolution_messages` na publication | `useRealtimeMessages.ts:189,218` |
| `financeiro.payment_links` | ✅ Adicionado em `20260724000006` | `PaymentLinksView.tsx:61` |
| `public.system_health_incidents` | ✅ Na publication | `ConnectionHealthPanel.tsx:95` |
| `zapp.agent_stats` | ✅ Adicionado em `20260724000005` | `useEvolutionAutoReconnect.ts:214` |
| `zapp.app_notifications` | ✅ Na publication | `useNotificationManagement.ts` múltiplos |
| `zapp.audio_meme_favorites` | ✅ Na publication | `useAudioManagement.ts:101` |
| `zapp.audio_memes` | ✅ Adicionado em `20260724000005` | `useAudioManagement.ts:85` |
| `zapp.automation_executions` | ✅ Na publication | `useAutomationLogs.ts:85` |
| `zapp.connection_health_logs` | ✅ Na publication | `DegradedConnectionsBanner.tsx:56` |
| `zapp.evolution_retry_metrics` | ✅ Na publication | `useEvolutionMonitoring.ts:86` |
| `zapp.failed_messages` | ✅ Tabela física, na publication | `useFailedMessages.ts` |
| `zapp.hmac_selftest_audit` | ✅ Na publication | `RateLimitRealtimeAlerts.tsx:64` |
| `zapp.message_reactions` | ✅ Na publication | `useRealtimeMessages.ts` |
| `zapp.password_reset_requests` | ✅ Na publication | `PasswordResetRequestsPanel.tsx:49` |
| `zapp.provider_message_log` | ⚠️ Verificar se está na publication | `genericService.ts:254` |
| `zapp.qr_attempts` | ✅ Adicionado em `20260724000005` | `useConnectionManagement.ts:55` |
| `zapp.queue_members` | ✅ Adicionado em `20260724000005` | `useQueues.ts:96` |
| `zapp.queue_positions` | ✅ Adicionado em `20260724000005` | `useQueues.ts:97` |
| `zapp.queues` | ✅ Adicionado em `20260724000005` | `useQueues.ts:95` |
| `zapp.rate_limit_logs` | ✅ Na publication | `RateLimitRealtimeAlerts.tsx` |
| `zapp.sales_deals` | ✅ Adicionado em `20260724000005` | `useAutomationSuggestions.ts:90` |
| `zapp.security_alerts` | ✅ Na publication | `useSecurityAuditLogs.ts:58` |
| `zapp.security_audit_logs` | ⚠️ Verificar — pode ser VIEW proxy | `useNotificationManagement.ts` |
| `zapp.sentiment_alerts` | ✅ Adicionado em `20260720000005` | `useRealtimeSentimentAlerts.ts:15` |
| `zapp.talkx_campaigns` | ✅ Adicionado em `20260724000005` | `TalkXView.tsx:93`, `TalkXLiveMonitor.tsx` |
| `zapp.team_conversation_members` | ✅ Na publication | `useRealtimeManagement.ts:135` |
| `zapp.team_conversations` | ⚠️ Verificar — adicionado em `20260724000009` | `useRealtimeManagement.ts:27,30` |
| `zapp.team_message_reactions` | ✅ Na publication | `useRealtimeManagement.ts` |
| `zapp.team_messages` | ✅ Adicionado em `20260724000005` | `useRealtimeManagement.ts:30` |
| `zapp.warroom_alerts` | ✅ Na publication | `useWarRoomAlerts.ts:48,62` |
| `zapp.whatsapp_connections` | ✅ Adicionado em `20260724000005` | `useEvolutionMonitoring.ts:82`, `useConnectionStatusIndicator.ts:148` |

## Canais com ⚠️ — Ação Necessária

| Canal | Problema | SQL Corretivo |
|-------|----------|---------------|
| `email_app.email_revalidation_jobs` | Não confirmado na publication | `ALTER PUBLICATION supabase_realtime ADD TABLE email_app.email_revalidation_jobs;` |
| `zapp.provider_message_log` | Não confirmado na publication | `ALTER PUBLICATION supabase_realtime ADD TABLE zapp.provider_message_log;` |
| `zapp.security_audit_logs` | Pode ser VIEW proxy | Verificar `SELECT relkind FROM pg_class WHERE relname='security_audit_logs'` |
| `zapp.team_conversations` | Adicionado em migration recente — confirmar | Verificar se migration foi aplicada |

## Canais de Presence/Broadcast (sem postgres_changes)

| Canal | Hook | Tipo |
|-------|------|------|
| `typing-presence-{conversationId}` | `useTypingPresence.ts:26` | Presence |
| `dashboard:{dashboardId}` | `useRealtimeManagement.ts:27` | Broadcast |
| `chat:{chatId}` | `useRealtimeManagement.ts:132` | postgres_changes |
| `monitor:{schema}:{tableName}` | `useRealtimeManagement.ts:165` | postgres_changes dinâmico |
| `typing:{chatId}` | `useRealtimeManagement.ts:205` | Presence |
| `notifications:team-chat` | `useNotificationManagement.ts:354` | postgres_changes |
| `notifications:security` | `useNotificationManagement.ts:402` | postgres_changes |
| `notifications:goals` | `useNotificationManagement.ts:432` | postgres_changes |
| `notifications:transcription` | `useNotificationManagement.ts:464` | postgres_changes |
| `transcription-notifications` | `useTranscriptionNotifications.ts:35` | postgres_changes |

## Smoke Test de Realtime (Procedimento Manual)

Para cada tabela marcada como ✅, verificar na UI ou via psql:

```sql
-- Verificar quais tabelas estão na publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;
```

Para cada canal ⚠️, executar:

```sql
-- Verificar se a tabela é física ou VIEW
SELECT relname, relkind, nspname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE relname IN (
  'email_revalidation_jobs',
  'provider_message_log',
  'security_audit_logs',
  'team_conversations'
)
ORDER BY nspname, relname;
-- relkind: 'r' = tabela física, 'v' = view, 'p' = particionada
```

## Regras de Validação (CI)

O workflow `.github/workflows/check-realtime-dead-channels.yml` verifica
automaticamente que todas as tabelas subscritas existem no schema esperado.
