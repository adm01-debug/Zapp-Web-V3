-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000010_m10_email_rls_security_corrections.sql
-- Purpose  : Corrige 4 falhas de segurança identificadas por revisão cubic-dev-ai
--            na migração M-7 (20260802000007_realtime_m7_rls_policies_and_conversation_sla.sql).
--
-- Correções:
--   C1 — email_app.email_health_summary: GRANT SELECT → GRANT ALL para service_role
--        M-7 concedeu apenas SELECT ao service_role, mas Edge Functions precisam
--        escrever linhas de saúde. Sem INSERT/UPDATE, escrita via service_role falha
--        ao nível de objeto (não é contornada pelo bypass de RLS do service_role).
--
--   C2 — email_app.email_health_summary: policy authenticated USING (true) → admin-only
--        SELECT aberto a todos os usuários autenticados expõe dados de saúde de email
--        via PostgREST e Realtime sem restrição. Fix: USING (zapp.is_admin_or_supervisor()).
--
--   C3 — email_app.email_revalidation_jobs: policies authenticated → admin-only
--        SELECT USING (true) e INSERT WITH CHECK (true) permitem que qualquer
--        usuário autenticado leia todos os resultados de revalidação e injete jobs
--        arbitrários com qualquer requested_by. Fix: admin-only para ambas as operations.
--
--   C4 — email_app.email_revalidation_jobs: GRANT granular
--        Concede apenas SELECT + INSERT ao authenticated (service_role recebe ALL).
--        Retido do M-7 mas agora consistente com policies admin-only.
--
-- Nota sobre M-6 P3 (idempotência de targets repetidos):
--   M-6 verifica `NOT EXISTS` em pg_publication_tables antes de qualquer ADD TABLE,
--   portanto repetir targets que M-2/M-4 já cobriram é um no-op seguro. Sem ação.
--
-- Idempotência: seguro para re-aplicar; usa IF EXISTS / DROP/CREATE via DO blocks.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- C1: GRANT ALL para service_role em email_health_summary (era apenas SELECT)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'email_app'
       AND table_name   = 'email_health_summary'
  ) THEN
    RAISE EXCEPTION '[M-10] C1: email_app.email_health_summary não existe — infra obrigatória ausente'
      USING ERRCODE = 'P0001';
  END IF;

  GRANT ALL ON email_app.email_health_summary TO service_role;
  RAISE NOTICE '[M-10] C1: GRANT ALL concedido ao service_role em email_health_summary';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C2: Substituir policy SELECT aberta por policy admin-only em email_health_summary
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'email_app'
       AND table_name   = 'email_health_summary'
  ) THEN
    RAISE EXCEPTION '[M-10] C2: email_app.email_health_summary não existe — infra obrigatória ausente'
      USING ERRCODE = 'P0001';
  END IF;

  -- Garantir RLS ativo (idempotente)
  ALTER TABLE email_app.email_health_summary ENABLE ROW LEVEL SECURITY;

  -- Remover policy aberta do M-7
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_health_summary'
       AND policyname = 'email_health_summary_select_authenticated'
  ) THEN
    DROP POLICY email_health_summary_select_authenticated ON email_app.email_health_summary;
    RAISE NOTICE '[M-10] C2: policy aberta email_health_summary_select_authenticated removida';
  END IF;

  -- Criar policy admin-only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_health_summary'
       AND policyname = 'email_health_summary_select_admin'
  ) THEN
    CREATE POLICY email_health_summary_select_admin
      ON email_app.email_health_summary
      FOR SELECT
      TO authenticated
      USING (zapp.is_admin_or_supervisor());
    RAISE NOTICE '[M-10] C2: policy admin-only email_health_summary_select_admin criada';
  ELSE
    RAISE NOTICE '[M-10] C2: policy admin-only email_health_summary_select_admin já existe — no-op';
  END IF;

  -- Manter policy service_role_all (criada em M-7; idempotente)
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
    RAISE NOTICE '[M-10] C2: policy service_role_all recriada para email_health_summary';
  END IF;

END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C3/C4: email_app.email_revalidation_jobs — policies admin-only + grant correto
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'email_app'
       AND table_name   = 'email_revalidation_jobs'
  ) THEN
    RAISE EXCEPTION '[M-10] C3: email_app.email_revalidation_jobs não existe — infra obrigatória ausente'
      USING ERRCODE = 'P0001';
  END IF;

  -- Garantir RLS ativo (idempotente)
  ALTER TABLE email_app.email_revalidation_jobs ENABLE ROW LEVEL SECURITY;

  -- C4: GRANT correto (apenas SELECT+INSERT para authenticated; ALL para service_role)
  GRANT SELECT, INSERT ON email_app.email_revalidation_jobs TO authenticated;
  GRANT ALL             ON email_app.email_revalidation_jobs TO service_role;
  RAISE NOTICE '[M-10] C4: GRANTs corrigidos em email_revalidation_jobs';

  -- Remover policy SELECT aberta do M-7
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_select_authenticated'
  ) THEN
    DROP POLICY email_revalidation_jobs_select_authenticated ON email_app.email_revalidation_jobs;
    RAISE NOTICE '[M-10] C3: policy aberta email_revalidation_jobs_select_authenticated removida';
  END IF;

  -- Remover policy INSERT aberta do M-7
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_insert_authenticated'
  ) THEN
    DROP POLICY email_revalidation_jobs_insert_authenticated ON email_app.email_revalidation_jobs;
    RAISE NOTICE '[M-10] C3: policy aberta email_revalidation_jobs_insert_authenticated removida';
  END IF;

  -- Policy SELECT admin-only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_select_admin'
  ) THEN
    CREATE POLICY email_revalidation_jobs_select_admin
      ON email_app.email_revalidation_jobs
      FOR SELECT
      TO authenticated
      USING (zapp.is_admin_or_supervisor());
    RAISE NOTICE '[M-10] C3: policy admin-only SELECT criada para email_revalidation_jobs';
  ELSE
    RAISE NOTICE '[M-10] C3: policy email_revalidation_jobs_select_admin já existe — no-op';
  END IF;

  -- Policy INSERT admin-only
  -- Nota: derivar requested_by server-side nas Edge Functions (não via client)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_insert_admin'
  ) THEN
    CREATE POLICY email_revalidation_jobs_insert_admin
      ON email_app.email_revalidation_jobs
      FOR INSERT
      TO authenticated
      WITH CHECK (zapp.is_admin_or_supervisor());
    RAISE NOTICE '[M-10] C3: policy admin-only INSERT criada para email_revalidation_jobs';
  ELSE
    RAISE NOTICE '[M-10] C3: policy email_revalidation_jobs_insert_admin já existe — no-op';
  END IF;

  -- Manter policy service_role_all (criada em M-7; idempotente)
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
    RAISE NOTICE '[M-10] C3: policy service_role_all recriada para email_revalidation_jobs';
  END IF;

END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação pós-aplicação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Verificar que policy aberta foi removida e admin-only existe
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_health_summary'
       AND policyname = 'email_health_summary_select_authenticated'
  ) THEN
    RAISE EXCEPTION '[M-10] VER FAILED C2: policy aberta email_health_summary_select_authenticated ainda existe'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_health_summary'
       AND policyname = 'email_health_summary_select_admin'
  ) THEN
    RAISE EXCEPTION '[M-10] VER FAILED C2: policy admin-only email_health_summary_select_admin não existe'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname IN ('email_revalidation_jobs_select_authenticated',
                          'email_revalidation_jobs_insert_authenticated')
  ) THEN
    RAISE EXCEPTION '[M-10] VER FAILED C3: policies abertas ainda existem em email_revalidation_jobs'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'email_app'
       AND tablename  = 'email_revalidation_jobs'
       AND policyname = 'email_revalidation_jobs_select_admin'
  ) THEN
    RAISE EXCEPTION '[M-10] VER FAILED C3: policy admin-only SELECT não existe em email_revalidation_jobs'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[M-10] VER: Todas as verificações passaram ✓';
  RAISE NOTICE '[M-10] VER C1: GRANT ALL service_role (verificação via object acl requer superuser — assumido OK)';
  RAISE NOTICE '[M-10] VER C2: email_health_summary — policy admin-only ✓';
  RAISE NOTICE '[M-10] VER C3: email_revalidation_jobs — policies admin-only ✓';
END $$;
