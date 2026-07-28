-- ============================================================
-- Migration 20260728000005
-- security: monitoring views SI + fn_rate_limit whitespace fix
--           + expand autofix/ddl-trigger scope + vendas revoke
-- ============================================================

-- 1. Aplicar security_invoker em todas as views do schema monitoring
DO $fix$
DECLARE r record; v_fixed int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname = 'monitoring' AND c.relkind = 'v'
      AND (c.reloptions IS NULL
           OR array_to_string(c.reloptions,',') NOT ILIKE '%security_invoker%')
  LOOP
    EXECUTE format('ALTER VIEW monitoring.%I SET (security_invoker = true)', r.relname);
    v_fixed := v_fixed + 1;
  END LOOP;
  RAISE NOTICE 'monitoring: % views com security_invoker aplicado', v_fixed;
END $fix$;

-- 2. REVOKE EXECUTE PUBLIC/anon em funcoes vendas sem SECURITY DEFINER
DO $rev$
DECLARE r record; v_cnt int := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname = 'vendas'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    BEGIN
      IF r.prokind = 'p' THEN
        EXECUTE format('REVOKE EXECUTE ON PROCEDURE vendas.%I(%s) FROM anon, PUBLIC',
                       r.proname, r.args);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION vendas.%I(%s) FROM anon, PUBLIC',
                       r.proname, r.args);
      END IF;
      v_cnt := v_cnt + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'vendas: % funcoes revogadas de anon/PUBLIC', v_cnt;
END $rev$;

-- 3. fn_rate_limit_check: fail-closed para empty/whitespace (trim ALL chars)
CREATE OR REPLACE FUNCTION zapp.fn_rate_limit_check(
  p_identifier    text,
  p_rpc_name      text,
  p_max_calls     integer DEFAULT 60,
  p_window_minutes integer DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $fn$
DECLARE
  v_count int;
  v_ws    timestamptz;
  v_id    text;
  v_rpc   text;
BEGIN
  -- Normalise: strip ALL whitespace (space, tab, newline, carriage-return)
  v_id  := regexp_replace(p_identifier, '^[\s]+|[\s]+$', '', 'g');
  v_rpc := regexp_replace(p_rpc_name,   '^[\s]+|[\s]+$', '', 'g');

  -- Fail-closed: NULL, empty-after-trim, zero/negative numeric args
  IF p_identifier IS NULL OR v_id = ''
    OR p_rpc_name IS NULL OR v_rpc = ''
    OR p_window_minutes IS NULL OR p_window_minutes <= 0
    OR p_max_calls IS NULL OR p_max_calls <= 0
  THEN
    RETURN FALSE;
  END IF;

  v_ws := to_timestamp(
    floor(EXTRACT(epoch FROM now()) / (p_window_minutes * 60))
    * (p_window_minutes * 60)
  );

  INSERT INTO rpc_rate_limits (identifier, rpc_name, window_start, call_count)
  VALUES (v_id, v_rpc, v_ws, 1)
  ON CONFLICT (identifier, rpc_name, window_start)
    DO UPDATE SET call_count = rpc_rate_limits.call_count + 1
  RETURNING call_count INTO v_count;

  RETURN v_count <= p_max_calls;
END;
$fn$;

-- 4. Expandir fn_autofix_security_invoker para cobrir todos os schemas de app
CREATE OR REPLACE FUNCTION zapp.fn_autofix_security_invoker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $fn$
DECLARE v_fixed int := 0; v_revoked int := 0; r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN (
      'public','zapp','evo','artes','financeiro',
      'monitoring','ops','vendas','email_app','ai','bpm','archive','logistica'
    )
      AND c.relkind = 'v'
      AND NOT (c.reloptions IS NOT NULL
               AND array_to_string(c.reloptions,',') ILIKE '%security_invoker%')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
    v_fixed := v_fixed + 1;
  END LOOP;

  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN (
      'zapp','evo','public','artes','financeiro',
      'monitoring','ops','vendas','email_app','ai','bpm','archive','logistica'
    )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    BEGIN
      IF r.prokind = 'p' THEN
        EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM anon, PUBLIC',
                       r.nspname, r.proname, r.args);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC',
                       r.nspname, r.proname, r.args);
      END IF;
      v_revoked := v_revoked + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  IF v_fixed > 0 OR v_revoked > 0 THEN
    RAISE LOG 'AUTOFIX: % views corrigidas, % fns revogadas de anon (ALL app schemas)',
              v_fixed, v_revoked;
  END IF;
END;
$fn$;

-- 5. Expandir DDL event trigger para novos schemas
CREATE OR REPLACE FUNCTION zapp.fn_trg_auto_security_invoker()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $fn$
DECLARE obj record; v_schema text; v_name text;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE VIEW','ALTER VIEW','CREATE OR REPLACE VIEW')
      AND object_type = 'view'
  LOOP
    v_schema := split_part(obj.object_identity, '.', 1);
    v_name   := split_part(obj.object_identity, '.', 2);
    IF v_schema IN (
      'public','zapp','evo','artes','financeiro',
      'monitoring','ops','vendas','email_app','ai','bpm','archive','logistica'
    ) THEN
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname = v_schema AND c.relname = v_name AND c.relkind = 'v'
            AND c.reloptions IS NOT NULL
            AND array_to_string(c.reloptions, ',') ILIKE '%security_invoker%'
        ) THEN
          EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v_schema, v_name);
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$fn$;

-- 6. Gate: garantir que monitoring views estao todas com SI
DO $gate$
DECLARE v_missing int;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname = 'monitoring' AND c.relkind = 'v'
    AND (c.reloptions IS NULL
         OR array_to_string(c.reloptions,',') NOT ILIKE '%security_invoker%');
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'GATE FAIL: % monitoring views ainda sem security_invoker', v_missing;
  END IF;
  RAISE NOTICE 'GATE OK: todas monitoring views com security_invoker';
END $gate$;
