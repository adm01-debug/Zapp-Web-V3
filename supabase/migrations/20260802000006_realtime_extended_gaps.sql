-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000006_realtime_extended_gaps.sql
-- Purpose  : Adiciona à publicação supabase_realtime as tabelas com subscriptions
--            ativas no frontend identificadas em varredura de 2026-08-02 como
--            ausentes da publication.
--
-- Contexto:
--   Varredura grep exaustiva de todas as chamadas .on('postgres_changes') em
--   src/ revelou 16 tabelas com subscriptions ativas não cobertas por
--   20260802000002 / 20260802000004 / 20260802000005.
--
-- Nota de segurança sobre VIEW proxies:
--   zapp.rate_limit_logs é VIEW proxy criada em 20260724000050 apontando para
--   public.rate_limit_logs. PostgreSQL não permite ADD TABLE de uma VIEW em
--   publicação (lança erro). O bloco verifica relkind IN ('r','p') ANTES do
--   ALTER PUBLICATION e pula VIEWs automaticamente com [SKIP].
--
-- Tabelas cobertas (16 targets, auto-skip para VIEWs):
--   1.  zapp.connection_health_logs     — ConnectionHealthPanel subscription
--   2.  zapp.password_reset_requests    — PasswordResetRequestsPanel subscription
--   3.  zapp.security_alerts            — RateLimitRealtimeAlerts subscription
--   4.  zapp.rate_limit_logs            — useRateLimitLogs (VIEW proxy → auto-skip)
--   5.  zapp.message_reactions          — useConversationReactionsRealtime
--   6.  zapp.automation_executions      — useAutomationFailureAlerts + 2 hooks
--   7.  zapp.team_conversations         — useTeamConversations
--   8.  zapp.team_conversation_members  — useTeamConversations
--   9.  zapp.team_message_reactions     — useTeamMessageReactions
--  10.  zapp.audio_meme_favorites       — useAudioManagement
--  11.  zapp.security_audit_logs        — useSecurityAuditLogs
--  12.  zapp.provider_message_log       — useBridgeStatus
--  13.  zapp.system_health_incidents    — useBridgeStatus
--  14.  zapp.hmac_selftest_audit        — useHmacAuditHistory
--  15.  email_app.email_health_summary  — useEmailHealthStatus
--  16.  email_app.email_revalidation_jobs — useEmailHealthStatus
--
-- Frontend refs confirmadas:
--   - zapp.connection_health_logs    : src/components/diagnostics/ConnectionHealthPanel.tsx:89
--   - zapp.password_reset_requests   : src/components/security/PasswordResetRequestsPanel.tsx:50
--   - zapp.security_alerts           : src/components/security/RateLimitRealtimeAlerts.tsx:82
--   - zapp.rate_limit_logs           : src/features/admin/hooks/useRateLimitLogs.ts:175
--   - zapp.message_reactions         : src/features/inbox/hooks/reactions/useConversationReactionsRealtime.ts:35
--   - zapp.automation_executions     : src/features/inbox/hooks/realtime/useAutomationFailureAlerts.ts:107,116
--                                      src/hooks/useAutomationLogs.ts:86
--                                      src/hooks/useAutomationManagement.ts:449
--   - zapp.team_conversations        : src/features/inbox/hooks/team-chat/useTeamConversations.ts:143
--   - zapp.team_conversation_members : src/features/inbox/hooks/team-chat/useTeamConversations.ts:148
--   - zapp.team_message_reactions    : src/features/inbox/hooks/team-chat/useTeamMessageReactions.ts:58
--   - zapp.audio_meme_favorites      : src/hooks/useAudioManagement.ts:104
--   - zapp.security_audit_logs       : src/hooks/useSecurityAuditLogs.ts:59
--   - zapp.provider_message_log      : src/pages/admin/useBridgeStatus.ts:187
--   - zapp.system_health_incidents   : src/pages/admin/useBridgeStatus.ts:202
--   - zapp.hmac_selftest_audit       : src/pages/admin-webhook-secret-status/useHmacAuditHistory.ts:73
--   - email_app.email_health_summary    : src/pages/admin/email/useEmailHealthStatus.ts:124
--   - email_app.email_revalidation_jobs : src/pages/admin/email/useEmailHealthStatus.ts:148
--
-- Idempotência: seguro para re-aplicar; verifica relkind e pg_publication_tables.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_schema        TEXT;
  v_table         TEXT;
  v_relkind       "char";
  v_in_pub        BOOLEAN;
  v_missing_count INT := 0;
  v_added_count   INT := 0;
  v_skipped_count INT := 0;
  v_missing_list  TEXT[] := ARRAY[]::TEXT[];

  -- 16 targets com subscriptions ativas no frontend
  v_targets TEXT[][] := ARRAY[
    ARRAY['zapp',      'connection_health_logs'],
    ARRAY['zapp',      'password_reset_requests'],
    ARRAY['zapp',      'security_alerts'],
    ARRAY['zapp',      'rate_limit_logs'],
    ARRAY['zapp',      'message_reactions'],
    ARRAY['zapp',      'automation_executions'],
    ARRAY['zapp',      'team_conversations'],
    ARRAY['zapp',      'team_conversation_members'],
    ARRAY['zapp',      'team_message_reactions'],
    ARRAY['zapp',      'audio_meme_favorites'],
    ARRAY['zapp',      'security_audit_logs'],
    ARRAY['zapp',      'provider_message_log'],
    ARRAY['zapp',      'system_health_incidents'],
    ARRAY['zapp',      'hmac_selftest_audit'],
    ARRAY['email_app', 'email_health_summary'],
    ARRAY['email_app', 'email_revalidation_jobs']
  ];

BEGIN
  RAISE NOTICE '[20260802000006] Iniciando: % tabelas para verificar', array_length(v_targets, 1);

  -- ── Fase 1: percorrer targets, verificar existência física, adicionar ────────
  FOR i IN 1..array_length(v_targets, 1) LOOP
    v_schema := v_targets[i][1];
    v_table  := v_targets[i][2];

    -- Verificar se a relação existe e qual seu tipo
    SELECT c.relkind
      INTO v_relkind
      FROM pg_catalog.pg_class  c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = v_schema
       AND c.relname = v_table;

    IF NOT FOUND THEN
      RAISE NOTICE '[SKIP] %.% não existe neste banco — ignorando', v_schema, v_table;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_relkind NOT IN ('r', 'p') THEN
      -- VIEW proxy (relkind='v'), sequence, etc. — não pode entrar na publication
      RAISE NOTICE '[SKIP] %.% existe mas relkind=''%'' (não é tabela física) — ignorando',
                   v_schema, v_table, v_relkind;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Verificar se já está na publicação
    SELECT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_publication_tables
       WHERE pubname    = 'supabase_realtime'
         AND schemaname = v_schema
         AND tablename  = v_table
    ) INTO v_in_pub;

    IF v_in_pub THEN
      RAISE NOTICE '[OK]   %.% já está em supabase_realtime', v_schema, v_table;
      CONTINUE;
    END IF;

    -- Adicionar à publicação
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
      v_schema, v_table
    );
    v_added_count := v_added_count + 1;
    RAISE NOTICE '[ADD]  %.% adicionada à supabase_realtime', v_schema, v_table;
  END LOOP;

  -- ── Fase 2: verificação pós-aplicação (apenas tabelas físicas) ────────────────
  RAISE NOTICE '[20260802000006] Verificação pós-aplicação...';

  FOR i IN 1..array_length(v_targets, 1) LOOP
    v_schema := v_targets[i][1];
    v_table  := v_targets[i][2];

    SELECT c.relkind
      INTO v_relkind
      FROM pg_catalog.pg_class  c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = v_schema
       AND c.relname = v_table;

    IF NOT FOUND OR v_relkind NOT IN ('r', 'p') THEN
      CONTINUE; -- já pulado na fase 1 (inexistente ou VIEW)
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_publication_tables
       WHERE pubname    = 'supabase_realtime'
         AND schemaname = v_schema
         AND tablename  = v_table
    ) INTO v_in_pub;

    IF NOT v_in_pub THEN
      v_missing_count := v_missing_count + 1;
      v_missing_list  := v_missing_list || (v_schema || '.' || v_table);
      RAISE WARNING '[FAIL] %.% NÃO está em supabase_realtime após tentativa de ADD!',
                    v_schema, v_table;
    END IF;
  END LOOP;

  -- ── Fase 3: resumo e decisão ─────────────────────────────────────────────────
  RAISE NOTICE '[20260802000006] Resumo: adicionadas=%, puladas=%, faltando=%',
               v_added_count, v_skipped_count, v_missing_count;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      '[20260802000006] % tabela(s) fisica(s) NÃO foram adicionadas à supabase_realtime: [%]. '
      'Verifique se a publicação existe e se o usuário tem permissão.',
      v_missing_count,
      array_to_string(v_missing_list, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[20260802000006] Concluído com sucesso.';
END $$;
