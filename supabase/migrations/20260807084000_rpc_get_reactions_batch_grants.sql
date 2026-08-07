-- ═══════════════════════════════════════════════════════════════════════
-- SECTION: 20260807084000_rpc_get_reactions_batch_grants.sql
-- ═══════════════════════════════════════════════════════════════════════

-- QA15-02 (revalidação da onda): a migration 20260807083000 versionou a RPC
-- mas NÃO carregava REVOKE/GRANT — um ambiente novo construído das migrations
-- criaria a função com EXECUTE PUBLIC (padrão inseguro; no banco vivo os
-- grants já estão corretos — QA11 verificou: authenticated ✓ / anon ✗ / sem
-- PUBLIC). Esta migration fecha o gap de paridade de ambiente, idempotente.

REVOKE ALL ON FUNCTION zapp.rpc_get_reactions_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_get_reactions_batch(uuid[]) TO authenticated, service_role;

-- ── Post-apply validation ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema = 'zapp'
      AND rp.routine_name = 'rpc_get_reactions_batch'
      AND rp.grantee = 'PUBLIC'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: EXECUTE PUBLIC ainda presente em zapp.rpc_get_reactions_batch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema = 'zapp'
      AND rp.routine_name = 'rpc_get_reactions_batch'
      AND rp.grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: EXECUTE ausente para authenticated';
  END IF;
  RAISE NOTICE 'OK: grants de zapp.rpc_get_reactions_batch corretos (sem PUBLIC, authenticated ok)';
END $$;
