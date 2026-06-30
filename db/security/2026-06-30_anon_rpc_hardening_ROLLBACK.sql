-- =====================================================================
-- ROLLBACK - restore anon (and PUBLIC) EXECUTE on the SECURITY DEFINER
-- functions revoked by 2026-06-30_anon_rpc_hardening.sql
-- =====================================================================
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT func_signature, had_public
           FROM archive.anon_func_grant_backup_20260630
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.func_signature);
    IF r.had_public THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.func_signature);
    END IF;
  END LOOP;
END $$;
COMMIT;
