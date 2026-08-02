-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000002_realtime_publication_all_gaps.sql
-- Purpose  : Adiciona à publicação supabase_realtime todas as tabelas que
--            o frontend subscreve mas que não tinham migração ativa cobrindo-as.
--
-- Contexto:
--   Auditoria exaustiva de 2026-08-02 identificou 17 tabelas subscritas via
--   Realtime no frontend (schema:zapp / email_app) sem nenhuma migração ativa
--   declarando ALTER PUBLICATION supabase_realtime ADD TABLE.
--   Algumas estavam em migrations arquivadas (archive/) ou foram aplicadas
--   diretamente no dump/restore inicial. Esta migration fecha esse gap de forma
--   idempotente e resiliente: tabelas que não existem fisicamente no ambiente
--   (relkind NOT IN ('r','p')) geram RAISE NOTICE e são puladas — permitindo
--   instalações frescas parciais sem abortar a migration inteira.
--
-- Tabelas cobertas (17):
--   1.  zapp.calls
--   2.  zapp.talkx_recipients
--   3.  zapp.dispatch_error_logs
--   4.  zapp.connection_health_logs
--   5.  zapp.security_alerts
--   6.  zapp.security_audit_logs
--   7.  zapp.password_reset_requests
--   8.  zapp.hmac_selftest_audit
--   9.  zapp.evolution_retry_metrics
--   10. zapp.message_reactions
--   11. zapp.team_message_reactions
--   12. zapp.audio_meme_favorites
--   13. zapp.system_health_incidents
--   14. zapp.provider_message_log
--   15. zapp.rate_limit_logs
--   16. email_app.email_health_summary
--   17. email_app.email_revalidation_jobs
--
-- Frontend refs confirmadas:
--   - zapp.calls                  : src/hooks/useIncomingCallListener.ts:33
--   - zapp.talkx_recipients       : src/components/talkx/TalkXLiveMonitor.tsx:62
--   - zapp.dispatch_error_logs    : src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts
--   - zapp.connection_health_logs : src/components/diagnostics/ConnectionHealthPanel.tsx:89
--   - zapp.security_alerts        : src/components/security/RateLimitRealtimeAlerts.tsx:82
--   - zapp.security_audit_logs    : src/hooks/useSecurityAuditLogs.ts:59
--   - zapp.password_reset_requests: src/components/security/PasswordResetRequestsPanel.tsx:50
--   - zapp.hmac_selftest_audit    : src/pages/admin-webhook-secret-status/useHmacAuditHistory.ts:73
--   - zapp.evolution_retry_metrics: src/features/admin/hooks/monitoring/useRetryMetrics.ts:127
--   - zapp.message_reactions      : src/features/inbox/hooks/useMessageReactions.ts:33
--                                   src/features/inbox/hooks/reactions/useConversationReactionsRealtime.ts:35
--   - zapp.team_message_reactions : src/features/inbox/hooks/team-chat/useTeamMessageReactions.ts:58
--   - zapp.audio_meme_favorites   : src/hooks/useAudioManagement.ts:104
--   - zapp.system_health_incidents: src/pages/admin/useBridgeStatus.ts:202
--   - zapp.provider_message_log   : src/pages/admin/useBridgeStatus.ts:187
--   - zapp.rate_limit_logs        : src/features/admin/hooks/useRateLimitLogs.ts:175
--   - email_app.email_health_summary   : src/pages/admin/email/useEmailHealthStatus.ts:124
--   - email_app.email_revalidation_jobs: src/pages/admin/email/useEmailHealthStatus.ts:148
--
-- Idempotência: seguro para re-aplicar; ADD TABLE é no-op se já na publication.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_target        RECORD;
  v_schema        TEXT;
  v_table         TEXT;
  v_relkind       "char";
  v_in_pub        BOOLEAN;
  v_missing_count INT := 0;
  v_added_count   INT := 0;
  v_skipped_count INT := 0;
  v_missing_list  TEXT[] := ARRAY[]::TEXT[];

  -- 17 gap tables: (schema, table_name)
  v_targets TEXT[][] := ARRAY[
    ARRAY['zapp',      'calls'],
    ARRAY['zapp',      'talkx_recipients'],
    ARRAY['zapp',      'dispatch_error_logs'],
    ARRAY['zapp',      'connection_health_logs'],
    ARRAY['zapp',      'security_alerts'],
    ARRAY['zapp',      'security_audit_logs'],
    ARRAY['zapp',      'password_reset_requests'],
    ARRAY['zapp',      'hmac_selftest_audit'],
    ARRAY['zapp',      'evolution_retry_metrics'],
    ARRAY['zapp',      'message_reactions'],
    ARRAY['zapp',      'team_message_reactions'],
    ARRAY['zapp',      'audio_meme_favorites'],
    ARRAY['zapp',      'system_health_incidents'],
    ARRAY['zapp',      'provider_message_log'],
    ARRAY['zapp',      'rate_limit_logs'],
    ARRAY['email_app', 'email_health_summary'],
    ARRAY['email_app', 'email_revalidation_jobs']
  ];

BEGIN
  RAISE NOTICE '[20260802000002] Iniciando: % tabelas para verificar', array_length(v_targets, 1);

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
      -- Tabela não existe neste ambiente (instalação fresca parcial?)
      RAISE NOTICE '[SKIP] %.% não existe neste banco — ignorando', v_schema, v_table;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_relkind NOT IN ('r', 'p') THEN
      -- Existe mas não é tabela física — é VIEW, sequence, etc.
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

  -- ── Fase 2: verificação pós-aplicação ────────────────────────────────────────
  RAISE NOTICE '[20260802000002] Verificação pós-aplicação...';

  FOR i IN 1..array_length(v_targets, 1) LOOP
    v_schema := v_targets[i][1];
    v_table  := v_targets[i][2];

    -- Só verificar tabelas que existem fisicamente
    SELECT c.relkind
      INTO v_relkind
      FROM pg_catalog.pg_class  c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = v_schema
       AND c.relname = v_table;

    IF NOT FOUND OR v_relkind NOT IN ('r', 'p') THEN
      CONTINUE; -- já pulado na fase 1, sem problema
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
  RAISE NOTICE '[20260802000002] Resumo: adicionadas=%, puladas=%, faltando=%',
               v_added_count, v_skipped_count, v_missing_count;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      '[20260802000002] % tabela(s) fisica(s) NÃO foram adicionadas à supabase_realtime: [%]. '
      'Verifique se a publicação existe e se o usuário tem permissão.',
      v_missing_count,
      array_to_string(v_missing_list, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[20260802000002] Concluído com sucesso.';
END $$;
