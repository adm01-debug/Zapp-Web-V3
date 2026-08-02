-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000005_realtime_final_9_gaps.sql
-- Purpose  : Adiciona à publicação supabase_realtime as 9 tabelas restantes
--            identificadas por auditoria exaustiva de 2026-08-02 como ausentes.
--
-- Contexto:
--   Auditoria grep confirmou que nenhuma migração não-arquivada contém
--   ALTER PUBLICATION supabase_realtime ADD TABLE para estas 9 tabelas.
--   Migrações de sessões anteriores (20260720000005, 20260725000009,
--   20260704000000) estão no diretório archive/ e não estão ativas.
--
-- Tabelas cobertas (9):
--   1.  zapp.app_notifications   — CRÍTICO: 7 pontos de subscription (notifs,
--                                   alerts, connection, DLQ, AuthProvider, etc.)
--   2.  zapp.failed_messages     — ALTO: painel DLQ admin + banner de alerta
--   3.  zapp.profiles            — ALTO: AuthProvider; permissões ficam stale
--   4.  zapp.user_roles          — ALTO: mudanças de papel não reativas
--   5.  email_app.email_threads  — MÉDIO: inbox de email sem live updates
--   6.  zapp.sentiment_alerts    — MÉDIO: hooks de alertas de sentimento
--   7.  evo.evolution_contacts   — MÉDIO: lista de contatos sem live updates
--   8.  zapp.whisper_messages    — MÉDIO: mensagens agente-agente sem live
--   9.  zapp.channel_connections — BAIXO: lista de canais stale até refresh
--
-- Frontend refs confirmadas:
--   - zapp.app_notifications  : src/hooks/useNotificationManagement.ts:357,405,436,469
--                               src/hooks/useRealtimeManagement.ts:31
--                               src/hooks/useConnectionAlertsPush.ts:25
--                               src/hooks/useConnectionManagement.ts:57
--   - zapp.failed_messages    : src/features/admin/hooks/monitoring/useFailedMessages.ts:167
--                               src/features/inbox/hooks/realtime/useFailedMessageAlerts.ts:57
--   - zapp.profiles           : src/features/auth/components/AuthProvider.tsx:415
--   - zapp.user_roles         : src/features/auth/components/AuthProvider.tsx:432
--   - email_app.email_threads : src/hooks/useEmail.ts:604
--                               src/hooks/useEmailManagement.ts:726
--   - zapp.sentiment_alerts   : src/hooks/useAlertManagement.ts:413
--                               src/hooks/useRealtimeSentimentAlerts.ts:18
--   - evo.evolution_contacts  : src/features/inbox/hooks/realtime/useRealtimeContacts.ts:270
--   - zapp.whisper_messages   : src/features/inbox/hooks/useRealtimeInbox.ts:238
--                               src/features/inbox/components/WhisperMode.tsx:101
--   - zapp.channel_connections: src/integrations/supabase/safe-queries.ts:176
--
-- Idempotência: seguro para re-aplicar; ADD TABLE é no-op se já na publication.
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

  -- 9 gap tables: (schema, table_name)
  v_targets TEXT[][] := ARRAY[
    ARRAY['zapp',      'app_notifications'],
    ARRAY['zapp',      'failed_messages'],
    ARRAY['zapp',      'profiles'],
    ARRAY['zapp',      'user_roles'],
    ARRAY['email_app', 'email_threads'],
    ARRAY['zapp',      'sentiment_alerts'],
    ARRAY['evo',       'evolution_contacts'],
    ARRAY['zapp',      'whisper_messages'],
    ARRAY['zapp',      'channel_connections']
  ];

BEGIN
  RAISE NOTICE '[20260802000005] Iniciando: % tabelas para verificar', array_length(v_targets, 1);

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
  RAISE NOTICE '[20260802000005] Verificação pós-aplicação...';

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
      CONTINUE; -- já pulado na fase 1
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
  RAISE NOTICE '[20260802000005] Resumo: adicionadas=%, puladas=%, faltando=%',
               v_added_count, v_skipped_count, v_missing_count;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      '[20260802000005] % tabela(s) fisica(s) NÃO foram adicionadas à supabase_realtime: [%]. '
      'Verifique se a publicação existe e se o usuário tem permissão.',
      v_missing_count,
      array_to_string(v_missing_list, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[20260802000005] Concluído com sucesso.';
END $$;
