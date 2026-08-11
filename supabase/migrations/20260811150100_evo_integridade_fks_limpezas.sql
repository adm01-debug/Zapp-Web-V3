-- ESPELHO do estado aplicado em produção em 2026-08-11 (DB-as-source).
-- Levas 2-6 da auditoria do schema evo: FKs novas, policies duplicadas removidas,
-- índices 0-scan removidos, comercial_03 eliminado, view de cobertura de documentação.
-- Todos os objetos já existem no banco — arquivo no-op com guards (alinhar repo×DB).

-- ============================================================
-- 1. VIEW de cobertura de documentação (etapa 5 do plano)
-- ============================================================
CREATE OR REPLACE VIEW evo.v_doc_coverage AS
SELECT c.relname AS tabela,
  count(a.attname) AS total_cols,
  count(col_description(c.oid, a.attnum)) AS cols_comentadas,
  round(100.0 * count(col_description(c.oid, a.attnum)) / NULLIF(count(a.attname),0), 1) AS pct,
  CASE WHEN obj_description(c.oid) IS NULL THEN 'SEM' ELSE 'OK' END AS tabela_comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'evo' AND c.relkind IN ('r','p')
GROUP BY c.relname, obj_description(c.oid)
ORDER BY pct, c.relname;

COMMENT ON VIEW evo.v_doc_coverage IS 'Cobertura de documentação do schema evo por tabela (colunas comentadas %, comment de tabela). Criada em 2026-08-11 (etapa 5 do plano de melhorias).';

-- ============================================================
-- 2. Policies service_role duplicadas removidas (3)
-- ============================================================
DROP POLICY IF EXISTS service_full_access ON evo.evolution_alerts;
DROP POLICY IF EXISTS service_full_access ON evo.evolution_pipeline_health_log;
DROP POLICY IF EXISTS reactions_service_all ON evo.evolution_reactions;

-- ============================================================
-- 3. Índices 0-scan removidos (4) — 0 scans desde boot do cluster
-- ============================================================
DROP INDEX IF EXISTS evo.idx_evo_media_remote_jid_created;
DROP INDEX IF EXISTS evo.idx_conv_wpp2_agent_status_last;
DROP INDEX IF EXISTS evo.idx_notif_status_read_created;
DROP INDEX IF EXISTS evo.idx_ingest_ledger_msgid;

-- ============================================================
-- 4. comercial_03 eliminado (tabela zumbi de teste + views de compat)
-- ============================================================
DROP VIEW IF EXISTS public.evolution_messages_comercial_03;
DROP VIEW IF EXISTS zapp.evolution_messages_comercial_03;
DROP TABLE IF EXISTS evo.evolution_messages_comercial_03;

-- ============================================================
-- 5. FKs novas (todas validadas em produção; guards idempotentes)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_mlr_message_uuid_instance' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.media_loss_registry ADD CONSTRAINT fk_mlr_message_uuid_instance
      FOREIGN KEY (message_uuid, instance_name) REFERENCES evo.evolution_messages (id, instance_name) ON DELETE NO ACTION NOT VALID;
    ALTER TABLE evo.media_loss_registry VALIDATE CONSTRAINT fk_mlr_message_uuid_instance;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_msgs_wpp2_reply_to' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_messages_wpp2 ADD CONSTRAINT fk_msgs_wpp2_reply_to
      FOREIGN KEY (reply_to_id, instance_name) REFERENCES evo.evolution_messages (id, instance_name) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_messages_wpp2 VALIDATE CONSTRAINT fk_msgs_wpp2_reply_to;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_followups_contact' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_followups ADD CONSTRAINT fk_followups_contact
      FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_followups VALIDATE CONSTRAINT fk_followups_contact;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sentiment_contact' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_sentiment_analysis ADD CONSTRAINT fk_sentiment_contact
      FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_sentiment_analysis VALIDATE CONSTRAINT fk_sentiment_contact;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_notifications_contact' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_notifications ADD CONSTRAINT fk_notifications_contact
      FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_notifications VALIDATE CONSTRAINT fk_notifications_contact;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_deals_contact' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_deals ADD CONSTRAINT fk_deals_contact
      FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_deals VALIDATE CONSTRAINT fk_deals_contact;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_tasks_contact' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_tasks ADD CONSTRAINT fk_tasks_contact
      FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_tasks VALIDATE CONSTRAINT fk_tasks_contact;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_calls_contact' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_calls ADD CONSTRAINT fk_calls_contact
      FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE evo.evolution_calls VALIDATE CONSTRAINT fk_calls_contact;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_mdq_message' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.media_download_queue ADD CONSTRAINT fk_mdq_message
      FOREIGN KEY (message_id, instance_name) REFERENCES evo.evolution_messages (message_id, instance_name) ON DELETE CASCADE NOT VALID;
    ALTER TABLE evo.media_download_queue VALIDATE CONSTRAINT fk_mdq_message;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_reactions_message' AND connamespace='evo'::regnamespace) THEN
    ALTER TABLE evo.evolution_reactions ADD CONSTRAINT fk_reactions_message
      FOREIGN KEY (message_id, instance_name) REFERENCES evo.evolution_messages (message_id, instance_name) ON DELETE CASCADE NOT VALID;
    ALTER TABLE evo.evolution_reactions VALIDATE CONSTRAINT fk_reactions_message;
  END IF;
END $$;

-- ============================================================
-- 6. Cron guardião semanal (job 479 — seg 06:30) — espelho do runtime
--    (não recriado aqui se já existir; o runtime é a fonte)
-- ============================================================
