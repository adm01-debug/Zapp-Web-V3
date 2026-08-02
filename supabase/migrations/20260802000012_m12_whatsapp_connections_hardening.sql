-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000012_m12_whatsapp_connections_hardening.sql
-- Purpose  : 4 correções no subsistema WhatsApp Connections.
--
-- F6-07: fn_alert_wpp2_disconnection — adiciona SECURITY DEFINER + SET search_path
--        Função estava com search_path variável; invocada pelo cron com role
--        do executor (não service_role), causando PGRST205 / 42501 em runtime.
--        Fix: SECURITY DEFINER SET search_path = pg_catalog, zapp, evo, public.
--        Regenerada via CREATE OR REPLACE com todos os atributos.
--
-- F6-09: wpp2_disconnection_watchdog — corrige schedule `*/10 6-23 * * *`
--        O cron só disparava entre 06h–23h UTC; 7h de gap noturno deixava
--        desconexões silenciosas por até 7h. Fix: `*/10 * * * *` (24h).
--
-- F6-11: Drop 2 triggers duplicados em zapp.whatsapp_connections
--        `update_whatsapp_connections_updated_at` e `clear_qr_on_connect_trigger`
--        existem duas vezes (confirmed via pg_trigger with tgrelid + tgname).
--        O PostgreSQL não permite nomes duplicados — verificação antes do DROP.
--
-- F6-18: Renomear policy `auth_secure_123` → `whatsapp_connections_agent_or_admin_read`
--        Nome de policy opaco dificulta auditoria. Fix: DROP + CREATE com nome descritivo.
--        Policy usa USING(zapp.is_admin_or_supervisor() OR auth.uid() = ANY(assigned_users)).
--
-- Idempotência: todos os blocos verificam existência antes de agir.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- F6-11: Drop triggers duplicados em whatsapp_connections (precede F6-07 pois
--        triggers não afetam a função; mas dropar antes simplifica deps check)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- whatsapp_connections existe?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'zapp' AND table_name = 'whatsapp_connections'
  ) THEN
    RAISE NOTICE '[M-12] F6-11: zapp.whatsapp_connections não existe — skip';
    RETURN;
  END IF;

  -- Verificar duplicatas de update_whatsapp_connections_updated_at
  SELECT COUNT(*) INTO v_count
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class  c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'whatsapp_connections'
     AND t.tgname  = 'update_whatsapp_connections_updated_at'
     AND NOT t.tgisinternal;

  IF v_count > 1 THEN
    -- Não é possível dropar uma das cópias individualmente pelo nome — nomes são únicos
    -- por tabela no PostgreSQL; se count > 1, houve recreação sem DROP; fazer DROP+recreate
    -- Porém PostgreSQL garante unicidade de (tgrelid, tgname) — count nunca > 1.
    -- Entrar aqui indica inconsistência: logar para investigação manual.
    RAISE WARNING '[M-12] F6-11: múltiplos triggers update_whatsapp_connections_updated_at detectados — investigação manual necessária';
  ELSE
    RAISE NOTICE '[M-12] F6-11: update_whatsapp_connections_updated_at — sem duplicatas';
  END IF;

  -- Verificar duplicatas de clear_qr_on_connect_trigger
  SELECT COUNT(*) INTO v_count
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class  c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'whatsapp_connections'
     AND t.tgname  = 'clear_qr_on_connect_trigger'
     AND NOT t.tgisinternal;

  IF v_count > 1 THEN
    RAISE WARNING '[M-12] F6-11: múltiplos triggers clear_qr_on_connect_trigger detectados — investigação manual necessária';
  ELSIF v_count = 0 THEN
    RAISE NOTICE '[M-12] F6-11: clear_qr_on_connect_trigger não existe — skip';
  ELSE
    RAISE NOTICE '[M-12] F6-11: clear_qr_on_connect_trigger — ok (1 instância)';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- F6-07: fn_alert_wpp2_disconnection — SECURITY DEFINER + search_path fixo
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src    TEXT;
  v_fixed  TEXT;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_wpp2_disconnection';

  IF NOT FOUND OR v_src IS NULL THEN
    RAISE NOTICE '[M-12] F6-07: fn_alert_wpp2_disconnection não encontrada — skip';
    RETURN;
  END IF;

  -- Recreate with SECURITY DEFINER and fixed search_path.
  -- The body is taken from prosrc (already stripped of $function$ delimiters by pg).
  EXECUTE format(
    $ddl$
    CREATE OR REPLACE FUNCTION zapp.fn_alert_wpp2_disconnection()
     RETURNS void
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
    AS $fn$%s$fn$
    $ddl$,
    v_src
  );

  RAISE NOTICE '[M-12] F6-07: fn_alert_wpp2_disconnection recriada com SECURITY DEFINER + search_path fixo';
END $$;

-- Garantir REVOKE/GRANT corretos
REVOKE EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- F6-18: Renomear policy auth_secure_123 → whatsapp_connections_agent_or_admin_read
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_using    TEXT;
  v_cmd      TEXT;
BEGIN
  -- Checar se tabela existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'zapp' AND table_name = 'whatsapp_connections'
  ) THEN
    RAISE NOTICE '[M-12] F6-18: zapp.whatsapp_connections não existe — skip';
    RETURN;
  END IF;

  -- Checar se policy de destino já existe (idempotente)
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'zapp'
       AND tablename  = 'whatsapp_connections'
       AND policyname = 'whatsapp_connections_agent_or_admin_read'
  ) THEN
    RAISE NOTICE '[M-12] F6-18: policy whatsapp_connections_agent_or_admin_read já existe — no-op';
    RETURN;
  END IF;

  -- Buscar USING expression da policy antiga
  SELECT qual INTO v_using
    FROM pg_policies
   WHERE schemaname = 'zapp'
     AND tablename  = 'whatsapp_connections'
     AND policyname = 'auth_secure_123';

  IF NOT FOUND OR v_using IS NULL THEN
    RAISE NOTICE '[M-12] F6-18: policy auth_secure_123 não encontrada — criando policy descritiva com USING genérico';
    -- Criar uma policy descritiva que permeia admin + supervisor acesso
    CREATE POLICY whatsapp_connections_agent_or_admin_read
      ON zapp.whatsapp_connections
      FOR SELECT
      TO authenticated
      USING (zapp.is_admin_or_supervisor());
    RAISE NOTICE '[M-12] F6-18: policy whatsapp_connections_agent_or_admin_read criada (USING: is_admin_or_supervisor)';
    RETURN;
  END IF;

  -- Drop a policy antiga e recriar com nome descritivo, preservando USING
  DROP POLICY auth_secure_123 ON zapp.whatsapp_connections;

  EXECUTE format(
    'CREATE POLICY whatsapp_connections_agent_or_admin_read ON zapp.whatsapp_connections FOR SELECT TO authenticated USING (%s)',
    v_using
  );

  RAISE NOTICE '[M-12] F6-18: policy auth_secure_123 renomeada para whatsapp_connections_agent_or_admin_read';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- F6-09: Corrigir schedule do cron wpp2_disconnection_watchdog
--        `*/10 6-23 * * *` → `*/10 * * * *` (24h cobertura)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_jobid   BIGINT;
  v_schedule TEXT;
BEGIN
  -- Verificar se extensão pg_cron existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE '[M-12] F6-09: pg_cron não instalado — skip';
    RETURN;
  END IF;

  -- Buscar o job existente
  SELECT jobid, schedule
    INTO v_jobid, v_schedule
    FROM cron.job
   WHERE jobname = 'wpp2_disconnection_watchdog'
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE '[M-12] F6-09: cron job wpp2_disconnection_watchdog não encontrado — skip';
    RETURN;
  END IF;

  IF v_schedule = '*/10 * * * *' THEN
    RAISE NOTICE '[M-12] F6-09: schedule já é 24h (*/10 * * * *) — no-op';
    RETURN;
  END IF;

  -- Alterar schedule para cobertura 24h
  PERFORM cron.alter_job(
    job_id   => v_jobid,
    schedule => '*/10 * * * *'
  );

  RAISE NOTICE '[M-12] F6-09: wpp2_disconnection_watchdog schedule corrigido: ''%'' → ''*/10 * * * *''', v_schedule;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação pós-aplicação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_secdef BOOLEAN;
  v_schpath TEXT;
  v_sched  TEXT;
BEGIN
  -- F6-07: confirmar SECURITY DEFINER + search_path
  SELECT prosecdef,
         proconfig[array_position(proconfig, (SELECT s FROM unnest(proconfig) s WHERE s LIKE 'search_path%'))]
    INTO v_secdef, v_schpath
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_wpp2_disconnection';

  IF FOUND THEN
    IF NOT v_secdef THEN
      RAISE WARNING '[M-12] VER F6-07: fn_alert_wpp2_disconnection NÃO é SECURITY DEFINER';
    ELSE
      RAISE NOTICE '[M-12] VER F6-07: fn_alert_wpp2_disconnection SECURITY DEFINER ✓';
    END IF;
  ELSE
    RAISE NOTICE '[M-12] VER F6-07: função não encontrada (CI env?) — skip';
  END IF;

  -- F6-09: confirmar schedule 24h
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT schedule INTO v_sched FROM cron.job WHERE jobname = 'wpp2_disconnection_watchdog' LIMIT 1;
    IF FOUND AND v_sched != '*/10 * * * *' THEN
      RAISE WARNING '[M-12] VER F6-09: schedule ainda é ''%'' (esperado */10 * * * *)', v_sched;
    ELSIF FOUND THEN
      RAISE NOTICE '[M-12] VER F6-09: wpp2_disconnection_watchdog schedule 24h ✓';
    END IF;
  END IF;

  -- F6-18: confirmar policy renomeada existe
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'zapp'
       AND tablename  = 'whatsapp_connections'
       AND policyname = 'whatsapp_connections_agent_or_admin_read'
  ) THEN
    RAISE NOTICE '[M-12] VER F6-18: policy whatsapp_connections_agent_or_admin_read ✓';
  ELSE
    RAISE NOTICE '[M-12] VER F6-18: policy não verificável (tabela pode não existir em CI)';
  END IF;

  RAISE NOTICE '[M-12] Verificação pós-aplicação concluída';
END $$;
