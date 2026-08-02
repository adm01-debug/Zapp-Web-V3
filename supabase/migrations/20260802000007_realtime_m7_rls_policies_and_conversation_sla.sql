-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000007_realtime_m7_rls_policies_and_conversation_sla.sql
-- Purpose  : (A) Adiciona RLS policies + GRANTs em email_app.email_health_summary
--                e email_app.email_revalidation_jobs (identificadas pelo Copilot
--                como "total lockout" — RLS habilitado sem policies em M-4).
--            (B) Adiciona zapp.conversation_sla à publicação supabase_realtime
--                (subscriptions ativas em useSLANotifications.ts:83,128 mas
--                tabela nunca adicionada à publication em migração não-arquivada).
--
-- Contexto Copilot review PR #712 (linhas 910, 997, 1089):
--   Migration 20260802000004 habilitou RLS em email_app.email_health_summary e
--   email_app.email_revalidation_jobs mas não criou policies nem garantiu GRANTs
--   no objeto base. Resultado: authenticated users recebem zero eventos mesmo
--   com a tabela na publication (default-deny sem policies).
--
-- Contexto conversation_sla:
--   20260724000043 (migração arquivada) pretendia adicionar zapp.conversation_sla
--   à supabase_realtime, mas nunca foi aplicada. useSLANotifications.ts subscreve
--   {schema:'zapp', table:'conversation_sla'} em duas locations (linhas 83, 128).
--   20260801040001 criou a policy conv_sla_select em zapp.conversation_sla,
--   confirmando que a tabela existe fisicamente em zapp.
--
-- Idempotência: seguro para re-aplicar; usa IF NOT EXISTS / DO blocks.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Parte A: email_app.email_health_summary — RLS policies + GRANTs ───────────
DO $$
BEGIN
  -- Garantir que RLS está ativo (idempotente)
  ALTER TABLE email_app.email_health_summary ENABLE ROW LEVEL SECURITY;

  -- GRANT SELECT ao service_role (bypass RLS por padrão, mas garantir acesso explícito)
  GRANT SELECT ON email_app.email_health_summary TO service_role;

  -- GRANT SELECT ao authenticated (necessário para Realtime + queries directas)
  GRANT SELECT ON email_app.email_health_summary TO authenticated;

  -- Policy SELECT para authenticated — acesso de leitura (dados de saúde do email
  -- são de nível admin; o controle granular fica na camada de componente/RPC)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_health_summary'
       AND policyname = 'email_health_summary_select_authenticated'
  ) THEN
    CREATE POLICY email_health_summary_select_authenticated
      ON email_app.email_health_summary
      FOR SELECT
      TO authenticated
      USING (true);
    RAISE NOTICE '[M-7] email_app.email_health_summary: policy SELECT criada';
  ELSE
    RAISE NOTICE '[M-7] email_app.email_health_summary: policy SELECT já existe';
  END IF;

  -- Policy para service_role (usado pelas Edge Functions)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_health_summary'
       AND policyname = 'email_health_summary_service_role_all'
  ) THEN
    CREATE POLICY email_health_summary_service_role_all
      ON email_app.email_health_summary
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE '[M-7] email_app.email_health_summary: policy service_role criada';
  ELSE
    RAISE NOTICE '[M-7] email_app.email_health_summary: policy service_role já existe';
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[M-7] email_health_summary RLS: ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── Parte A: email_app.email_revalidation_jobs — RLS policies + GRANTs ────────
DO $$
BEGIN
  -- Garantir que RLS está ativo (idempotente)
  ALTER TABLE email_app.email_revalidation_jobs ENABLE ROW LEVEL SECURITY;

  -- GRANTs
  GRANT SELECT, INSERT ON email_app.email_revalidation_jobs TO authenticated;
  GRANT ALL             ON email_app.email_revalidation_jobs TO service_role;

  -- Policy SELECT para authenticated
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_select_authenticated'
  ) THEN
    CREATE POLICY email_revalidation_jobs_select_authenticated
      ON email_app.email_revalidation_jobs
      FOR SELECT
      TO authenticated
      USING (true);
    RAISE NOTICE '[M-7] email_app.email_revalidation_jobs: policy SELECT criada';
  ELSE
    RAISE NOTICE '[M-7] email_app.email_revalidation_jobs: policy SELECT já existe';
  END IF;

  -- Policy INSERT para authenticated (revalidation jobs podem ser criados pelo user)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_insert_authenticated'
  ) THEN
    CREATE POLICY email_revalidation_jobs_insert_authenticated
      ON email_app.email_revalidation_jobs
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
    RAISE NOTICE '[M-7] email_app.email_revalidation_jobs: policy INSERT criada';
  ELSE
    RAISE NOTICE '[M-7] email_app.email_revalidation_jobs: policy INSERT já existe';
  END IF;

  -- Policy ALL para service_role (Edge Functions)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_service_role_all'
  ) THEN
    CREATE POLICY email_revalidation_jobs_service_role_all
      ON email_app.email_revalidation_jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE '[M-7] email_app.email_revalidation_jobs: policy service_role criada';
  ELSE
    RAISE NOTICE '[M-7] email_app.email_revalidation_jobs: policy service_role já existe';
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[M-7] email_revalidation_jobs RLS: ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── Parte B: zapp.conversation_sla → supabase_realtime ────────────────────────
DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  -- Verificar se zapp.conversation_sla existe e é tabela física
  SELECT c.relkind
    INTO v_relkind
    FROM pg_catalog.pg_class  c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'conversation_sla';

  IF NOT FOUND THEN
    RAISE NOTICE '[M-7] zapp.conversation_sla não existe neste banco — ignorando';
    RETURN;
  END IF;

  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE NOTICE '[M-7] zapp.conversation_sla existe mas relkind=''%'' (não é tabela física) — ignorando',
                 v_relkind;
    RETURN;
  END IF;

  -- Verificar se já está na publication
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'zapp'
       AND tablename  = 'conversation_sla'
  ) INTO v_in_pub;

  IF v_in_pub THEN
    RAISE NOTICE '[M-7] zapp.conversation_sla já está em supabase_realtime — no-op';
    RETURN;
  END IF;

  -- Adicionar à publication
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.conversation_sla';
  RAISE NOTICE '[M-7] zapp.conversation_sla adicionada à supabase_realtime';

  -- Verificação pós-aplicação
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'zapp'
       AND tablename  = 'conversation_sla'
  ) INTO v_in_pub;

  IF NOT v_in_pub THEN
    RAISE EXCEPTION '[M-7] zapp.conversation_sla NÃO está em supabase_realtime após ADD — verifique permissões!'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[M-7] Verificação pós-aplicação: zapp.conversation_sla ✓ em supabase_realtime';
END $$;
