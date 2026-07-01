-- ROLLBACK for 2026-06-30_anon_hardening_phase2.sql
BEGIN;
-- restore schema USAGE
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schema_name FROM archive.anon_schema_usage_backup_20260630 LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', r.schema_name);
  END LOOP;
END $$;
-- restore invoker function EXECUTE (anon, and PUBLIC where it existed)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT func_signature, had_public FROM archive.anon_invoker_func_backup_20260630 LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.func_signature);
    IF r.had_public THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.func_signature);
    END IF;
  END LOOP;
END $$;
COMMIT;
