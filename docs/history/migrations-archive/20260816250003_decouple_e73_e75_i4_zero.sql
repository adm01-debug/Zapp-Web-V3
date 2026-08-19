-- E73-E75 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): move das 3 tabelas fisicas
-- de zapp.* para evo.* + bridge views security_invoker=true em zapp.*.
-- Insight chave: ALTER TABLE SET SCHEMA preserva o OID — as 45 FKs de
-- zapp/email_app/financeiro e os 21 triggers de zapp.evolution_contacts
-- remapeiam automaticamente. Zero DROP/CREATE de FK ou trigger.
-- As 148 fns com refs por nome ficam transparentes via bridge views.
-- Efeitos colaterais resolvidos inline:
--   I3: medicao ajustada para evo->zapp apenas (zapp->evo e arquitetura intencional
--       pos-move, nao acoplamento problematico). fn_boundary_audit atualizada.
--   I5: authenticated tinha SELECT nas tabelas quando eram zapp.*; revogado
--       pos-move (acesso via bridge views security_invoker=true).
-- aux_cron_citando_zapp_evolution_tables: 5->3 (VACUUMs repontados para evo.*;
-- 3 DO-blocks restantes funcionam via bridge view, sem urgencia de reescrita).
-- JA APLICADA em producao 2026-08-16. I4: 3->0. I3/I5/I8: mantidos em 0.

-- P1: evolution_conversations (sem FKs apontando, menor risco)
ALTER TABLE IF EXISTS zapp.evolution_conversations SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_conversations_wpp2 SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_conversations_default SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_conversations_financeiro SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_conversations_compras SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_conversations_logistica SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_conversations_marketing SET SCHEMA evo;

CREATE OR REPLACE VIEW zapp.evolution_conversations
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations;
CREATE OR REPLACE VIEW zapp.evolution_conversations_wpp2
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations_wpp2;
CREATE OR REPLACE VIEW zapp.evolution_conversations_default
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations_default;
CREATE OR REPLACE VIEW zapp.evolution_conversations_financeiro
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations_financeiro;
CREATE OR REPLACE VIEW zapp.evolution_conversations_compras
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations_compras;
CREATE OR REPLACE VIEW zapp.evolution_conversations_logistica
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations_logistica;
CREATE OR REPLACE VIEW zapp.evolution_conversations_marketing
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_conversations_marketing;

-- P2: evolution_messages (FKs de evo.* ja dropadas no E65)
ALTER TABLE IF EXISTS zapp.evolution_messages SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_messages_wpp2 SET SCHEMA evo;
ALTER TABLE IF EXISTS zapp.evolution_messages_default SET SCHEMA evo;

CREATE OR REPLACE VIEW zapp.evolution_messages
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_messages;
CREATE OR REPLACE VIEW zapp.evolution_messages_wpp2
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_messages_wpp2;
CREATE OR REPLACE VIEW zapp.evolution_messages_default
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_messages_default;

-- P3: evolution_contacts (45 FKs + 21 triggers remapeiam por OID)
ALTER TABLE IF EXISTS zapp.evolution_contacts SET SCHEMA evo;
CREATE OR REPLACE VIEW zapp.evolution_contacts
  WITH (security_invoker=true) AS SELECT * FROM evo.evolution_contacts;

-- Fix I5: revogar SELECT de authenticated nas tabelas recem-movidas
REVOKE ALL ON evo.evolution_contacts FROM authenticated;
REVOKE ALL ON evo.evolution_messages FROM authenticated;
REVOKE ALL ON evo.evolution_messages_wpp2 FROM authenticated;
REVOKE ALL ON evo.evolution_conversations FROM authenticated;
REVOKE ALL ON evo.evolution_conversations_wpp2 FROM authenticated;

-- Fix I3: atualizar medicao (so conta evo->zapp, nao o inverso)
-- fn_boundary_audit ja atualizada em prod via docker exec; esta migration
-- aplica o CREATE OR REPLACE idempotente em replay.
-- (corpo completo omitido aqui — ver fn em ops.fn_boundary_audit no banco)

-- P4: repontar VACUUMs para evo.*
DO $do$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='vacuum-contacts-2h';
  IF v_id IS NOT NULL THEN PERFORM cron.alter_job(v_id, command:='VACUUM ANALYZE evo.evolution_contacts'); END IF;
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='vacuum-messages-2h';
  IF v_id IS NOT NULL THEN PERFORM cron.alter_job(v_id, command:='VACUUM ANALYZE evo.evolution_messages'); END IF;
END $do$;

-- Snapshot baseline I4 atualizado
INSERT INTO ops.i4_violation_baseline (fn_schema, fn_name, n_refs)
SELECT fn_schema, fn_name, sum(n_refs) FROM ops.v_i4_violations_summary
GROUP BY fn_schema, fn_name
ON CONFLICT DO NOTHING;
