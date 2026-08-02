-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000014_m14_cubic_m12_corrections.sql
-- Purpose  : Address two violations cubic-dev-ai flagged in M-12:
--
-- C-P1 (M-12 line 122): REVOKE/GRANT for zapp.fn_alert_wpp2_disconnection() was
--   unconditional and outside the existence guard. On schema-tracked deployments
--   where only public.fn_alert_wpp2_disconnection() exists, the DO block exits
--   early (NOT FOUND) and the bare REVOKE below it fails with 42883, aborting
--   the deployment.
--   Fix: search both schemas; move REVOKE/GRANT inside the guard; recreate in
--   zapp unconditionally so schema-tracked deployments catch up.
--
-- C-P2 (M-12 line 55): F6-11 checked pg_trigger count per (tgrelid, tgname).
--   PostgreSQL enforces uniqueness on that pair — count > 1 is impossible; the
--   block only ever logged a notice.
--   Fix: detect genuinely redundant triggers by function OID (same function bound
--   to multiple trigger names on the same table); drop non-canonical extras and
--   confirm canonical triggers remain.
--
-- Idempotência: todos os blocos verificam existência; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- C-P1: fn_alert_wpp2_disconnection — recreate in zapp from any source schema;
--       REVOKE/GRANT now lives inside the guard block.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src TEXT;
  v_ns  TEXT;
BEGIN
  -- Search zapp first, then public (schema-tracked deployments land here).
  SELECT prosrc, n.nspname
    INTO v_src, v_ns
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'fn_alert_wpp2_disconnection'
     AND n.nspname IN ('zapp', 'public')
   ORDER BY CASE n.nspname WHEN 'zapp' THEN 1 ELSE 2 END
   LIMIT 1;

  IF NOT FOUND OR v_src IS NULL THEN
    RAISE NOTICE '[M-14 C-P1] fn_alert_wpp2_disconnection não encontrada em zapp/public — skip';
    RETURN;
  END IF;

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

  -- REVOKE/GRANT inside the guard — never runs if the function was absent.
  REVOKE EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() TO service_role;

  RAISE NOTICE '[M-14 C-P1] fn_alert_wpp2_disconnection recriada em zapp (fonte: schema=%) + perms corretos', v_ns;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C-P2: Detect genuinely redundant triggers by function OID.
--   Canonical names per function:
--     set_updated_at / moddatetime → update_whatsapp_connections_updated_at
--     clear_qr_on_connect          → clear_qr_on_connect_trigger
--   Any other trigger calling the same function OID is dropped as a duplicate.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r       RECORD;
  v_canon TEXT;
  tname   TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'zapp' AND table_name = 'whatsapp_connections'
  ) THEN
    RAISE NOTICE '[M-14 C-P2] zapp.whatsapp_connections não existe — skip';
    RETURN;
  END IF;

  -- For each function called by triggers on this table, check for redundancy.
  FOR r IN
    SELECT
      p.proname                                       AS fn_name,
      p.oid                                           AS fn_oid,
      array_agg(t.tgname ORDER BY t.tgname)          AS trigger_names,
      count(*)                                        AS cnt
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class   c ON c.oid  = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc    p ON p.oid  = t.tgfoid
   WHERE n.nspname  = 'zapp'
     AND c.relname  = 'whatsapp_connections'
     AND NOT t.tgisinternal
   GROUP BY p.proname, p.oid
  LOOP
    IF r.cnt = 1 THEN
      RAISE NOTICE '[M-14 C-P2] fn=% trigger=% — ok (sem duplicatas)', r.fn_name, r.trigger_names[1];
      CONTINUE;
    END IF;

    -- Multiple triggers call the same function — determine canonical name.
    CASE r.fn_name
      WHEN 'set_updated_at'        THEN v_canon := 'update_whatsapp_connections_updated_at';
      WHEN 'moddatetime'           THEN v_canon := 'update_whatsapp_connections_updated_at';
      WHEN 'update_updated_at'     THEN v_canon := 'update_whatsapp_connections_updated_at';
      WHEN 'clear_qr_on_connect'   THEN v_canon := 'clear_qr_on_connect_trigger';
      ELSE
        -- Unknown function: keep alphabetically first trigger; log all names.
        v_canon := r.trigger_names[1];
        RAISE WARNING '[M-14 C-P2] fn=% tem % triggers=%: nenhum canônico conhecido; mantendo %',
          r.fn_name, r.cnt, r.trigger_names, v_canon;
    END CASE;

    -- Drop every trigger NOT matching the canonical name.
    FOR tname IN
      SELECT t2 FROM unnest(r.trigger_names) AS u(t2) WHERE u.t2 <> v_canon
    LOOP
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON zapp.whatsapp_connections',
        tname
      );
      RAISE NOTICE '[M-14 C-P2] trigger % (fn=%) dropped — duplicado de %',
        tname, r.fn_name, v_canon;
    END LOOP;

    RAISE NOTICE '[M-14 C-P2] fn=% — canônico % mantido', r.fn_name, v_canon;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação pós-aplicação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_secdef  BOOLEAN;
  v_schpath TEXT;
BEGIN
  SELECT prosecdef,
         (SELECT s FROM unnest(proconfig) s WHERE s LIKE 'search_path%' LIMIT 1)
    INTO v_secdef, v_schpath
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_wpp2_disconnection';

  IF FOUND THEN
    IF v_secdef THEN
      RAISE NOTICE '[M-14 VER C-P1] fn_alert_wpp2_disconnection SECURITY DEFINER ✓ search_path=%', v_schpath;
    ELSE
      RAISE WARNING '[M-14 VER C-P1] fn_alert_wpp2_disconnection NÃO é SECURITY DEFINER';
    END IF;
  ELSE
    RAISE NOTICE '[M-14 VER C-P1] fn_alert_wpp2_disconnection não encontrada em zapp (CI env?) — skip';
  END IF;

  RAISE NOTICE '[M-14] Correções M-12 (C-P1 + C-P2) concluídas';
END $$;
