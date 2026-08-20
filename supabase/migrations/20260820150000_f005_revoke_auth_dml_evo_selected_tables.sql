-- F-005 (PLANO-100 GATE-A) — REVOKE INSERT/UPDATE/DELETE de authenticated em evo.*
-- Aplicado em produção 2026-08-20:
--   11 tabelas: evolution_messages_wpp2, evolution_contacts, evolution_conversations_wpp2,
--   evolution_conversations, evolution_conversations_default, evolution_conversations_compras,
--   evolution_conversations_financeiro, evolution_conversations_logistica,
--   evolution_conversations_marketing, evolution_messages, evolution_messages_default
--   Total: 33 grants revogados.
--   ALTER DEFAULT PRIVILEGES aplicado (impede recriação em novas tabelas).
-- Snapshot rollback: _grant_snapshot_gatea (33 rows).
-- RPCs SECURITY DEFINER (rpc_insert_message, zapp.rpc_boundary_*) não afetadas.
--
-- ROLLBACK COMPLETO:
--   INSERT INTO _grant_snapshot_gatea
--   SELECT table_schema, table_name, privilege_type
--   FROM information_schema.table_privileges
--   WHERE table_schema='evo' AND grantee='service_role'
--     AND privilege_type IN ('INSERT','UPDATE','DELETE');
--   -- executar com base na snapshot salva

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['evolution_messages_wpp2','evolution_contacts','evolution_conversations_wpp2',
    'evolution_conversations','evolution_conversations_default','evolution_conversations_compras',
    'evolution_conversations_financeiro','evolution_conversations_logistica',
    'evolution_conversations_marketing','evolution_messages','evolution_messages_default']
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE evo.%I FROM authenticated', t);
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA evo REVOKE INSERT, UPDATE, DELETE ON TABLES FROM authenticated;
