-- =====================================================================
-- ROLLBACK - restore anon grants revoked by the 2026-06-30 hardening
-- =====================================================================
BEGIN;

-- 1) re-grant everything captured by the FULL script
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schema, rel, privs
           FROM archive.anon_grant_backup_20260630
           WHERE privs IS NOT NULL
  LOOP
    EXECUTE format('GRANT %s ON %I.%I TO anon', r.privs, r.schema, r.rel);
  END LOOP;
END $$;

-- 2) restore the two anon policies dropped during the live 2026-06-30 fix
DROP POLICY IF EXISTS anon_read ON evo.evolution_messages;
CREATE POLICY anon_read ON evo.evolution_messages
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_read_conversations ON evo.evolution_conversations;
CREATE POLICY anon_read_conversations ON evo.evolution_conversations
  FOR SELECT TO anon USING (true);

-- 3) re-grant the relations revoked LIVE on 2026-06-30 (not in backup table)
GRANT SELECT ON public.messages, public.conversations,
                public.evolution_messages, public.evolution_conversations,
                public.v_vault_health, public.evolution_instance_credentials,
                public.n8n_variables, public._vault_corrupted_quarantine,
                public._system_health_history, public._system_health_log TO anon;
GRANT SELECT, INSERT ON evo.evolution_messages TO anon;
GRANT SELECT ON evo.evolution_conversations, evo.migration_watermark TO anon;

COMMIT;
