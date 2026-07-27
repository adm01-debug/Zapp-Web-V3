-- ============================================================
-- MIGRATION: DDL Event Trigger — auto security_invoker
-- DATE: 2026-07-28
-- PROBLEM: CREATE OR REPLACE VIEW wipes security_invoker setting,
--   creating a 30min window before the autofix cron catches it.
-- SOLUTION: DDL event trigger fires immediately on CREATE VIEW /
--   ALTER VIEW and auto-applies security_invoker=true for app schemas.
-- ============================================================

-- Function: fn_trg_auto_security_invoker
CREATE OR REPLACE FUNCTION zapp.fn_trg_auto_security_invoker()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog AS $$
DECLARE
  obj record;
  v_schema text;
  v_name   text;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE VIEW','ALTER VIEW','CREATE OR REPLACE VIEW')
      AND object_type = 'view'
  LOOP
    v_schema := split_part(obj.object_identity, '.', 1);
    v_name   := split_part(obj.object_identity, '.', 2);

    -- Only app schemas — never monitoring, vault, pg_catalog, etc.
    IF v_schema IN ('public','zapp','evo','artes','financeiro') THEN
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname = v_schema AND c.relname = v_name AND c.relkind = 'v'
            AND c.reloptions IS NOT NULL
            AND array_to_string(c.reloptions, ',') ILIKE '%security_invoker%'
        ) THEN
          EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v_schema, v_name);
          RAISE LOG 'AUTO_SI_TRIGGER: security_invoker aplicado em %.%', v_schema, v_name;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'AUTO_SI_TRIGGER: falha em %.%: %', v_schema, v_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$$;

-- Event trigger: fires on ddl_command_end for CREATE VIEW / ALTER VIEW
DROP EVENT TRIGGER IF EXISTS trg_auto_security_invoker_on_ddl;
CREATE EVENT TRIGGER trg_auto_security_invoker_on_ddl
  ON ddl_command_end
  WHEN TAG IN ('CREATE VIEW', 'ALTER VIEW')
  EXECUTE FUNCTION zapp.fn_trg_auto_security_invoker();

-- VERIFICATION:
-- SELECT evtname, evtevent, evtfoid::regproc, evtenabled
-- FROM pg_event_trigger WHERE evtname='trg_auto_security_invoker_on_ddl';
-- expected: O (enabled)
