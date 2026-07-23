-- =============================================================================
-- Migration v14: Schema Hardening — 24 novos CHECK constraints (evo: 19, zapp: 5)
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit — varredura exaustiva pós-v13)
--
-- Contexto:
--   Varredura de todas as colunas text/varchar com nomes enum-like ('status',
--   'role','direction','type','mode','state') sem CHECK constraint em zapp+evo.
--   Auditoria cruzou: column defaults, dados de produção (SELECT DISTINCT),
--   código-fonte (migrations SQL + edge functions TypeScript), e triggers.
--
-- Alterações (NOT VALID + VALIDATE para zero downtime):
--
-- EVO (19 constraints):
--   1.  evolution_automation_logs.status      (nullable)  6 valores
--   2.  evolution_bitrix_queue.status         (nullable)  5 valores
--   3.  evolution_bootstrap_log.status        (nullable)  4 valores  ← 23 rows prod
--   4.  evolution_broadcasts.status           (nullable)  7 valores
--   5.  evolution_campaign_recipients.status  (nullable)  7 valores
--   6.  evolution_campaigns.status            (nullable)  5 valores
--   7.  evolution_followups.status            (nullable)  6 valores
--   8.  evolution_group_participants.role     (nullable)  3 valores
--   9.  evolution_message_queue.status        (nullable)  6 valores
--  10.  evolution_messages_wpp2_archive.direction (nullable) 2 valores ← tabela independente
--  11.  evolution_messages_wpp2_archive.status    (nullable) 8 valores ← mesmos do root
--  12.  evolution_mirror_media_queue.status   (NOT NULL)  4 valores
--  13.  evolution_mirror_runs.status          (NOT NULL)  5 valores
--  14.  evolution_notification_log.status     (nullable)  5 valores
--  15.  evolution_notifications.status        (nullable)  4 valores  ← 8664 rows prod
--  16.  evolution_scheduled_messages.status   (nullable)  6 valores
--  17.  evolution_tasks.status                (nullable)  5 valores  ← 6 rows prod
--  18.  evolution_typebot_sessions.status     (nullable)  5 valores
--  19.  evolution_webhook_dlq.status          (NOT NULL)  2 valores
--         ('pending'|'poison' — fn_flag_poison_messages em evo_dlq_poison_guard.sql)
--
-- ZAPP (5 constraints):
--   1.  conversation_participants.role   (NOT NULL)  4 valores
--   2.  department_invitations.role      (NOT NULL)  3 valores
--   3.  email_health_logs.status         (NOT NULL)  5 valores  ← 9 rows prod
--   4.  notifications.type               (NOT NULL)  8 valores
--         (espelha app_notifications_type_check validado em produção)
--   5.  provider_message_log.direction   (NOT NULL)  2 valores
--
-- Nota sobre evolution_messages_wpp2_archive:
--   Confirmado como relkind='r' (tabela regular independente, não é partição).
--   NÃO herda constraints de evo.evolution_messages. Precisa de constraints próprias.
--   Valores mapeados diretamente dos constraints da tabela raiz.
--
-- Dados produção validados ANTES da escrita desta migration:
--   evolution_notifications.status:    8664 × 'pending'            ← 'pending' incluso
--   evolution_tasks.status:               6 × 'overdue'            ← 'overdue' incluso
--   evolution_bootstrap_log.status:      22 × 'registered', 1 × 'ok' ← ambos inclusos
--   email_health_logs.status:             7 × 'error', 2 × 'healthy' ← ambos inclusos
--
-- Descoberta durante apply (não prevista na análise inicial):
--   evolution_messages_wpp2_archive.status: 25 × 'DELIVERY_ACK', 5 × 'ERROR'
--   → valores raw da WA API, normalizados via UPDATE antes do CHECK constraint
--   → DELIVERY_ACK → delivered | ERROR → failed (mapeamento semântico correto)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EVO — PARTE 1: evolution_automation_logs.status
-- ---------------------------------------------------------------------------
DO $evo_1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_automation_logs'
      AND co.conname = 'evolution_automation_logs_status_check'
  ) THEN
    ALTER TABLE evo.evolution_automation_logs
      ADD CONSTRAINT evolution_automation_logs_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','processing','success','completed','failed','error'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_automation_logs_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_automation_logs_status_check já existe — skip';
  END IF;
END $evo_1$;
ALTER TABLE evo.evolution_automation_logs VALIDATE CONSTRAINT evolution_automation_logs_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 2: evolution_bitrix_queue.status
-- ---------------------------------------------------------------------------
DO $evo_2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_bitrix_queue'
      AND co.conname = 'evolution_bitrix_queue_status_check'
  ) THEN
    ALTER TABLE evo.evolution_bitrix_queue
      ADD CONSTRAINT evolution_bitrix_queue_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','processing','sent','failed','error'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_bitrix_queue_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_bitrix_queue_status_check já existe — skip';
  END IF;
END $evo_2$;
ALTER TABLE evo.evolution_bitrix_queue VALIDATE CONSTRAINT evolution_bitrix_queue_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 3: evolution_bootstrap_log.status
-- Produção: 22 × 'registered', 1 × 'ok' — ambos inclusos
-- ---------------------------------------------------------------------------
DO $evo_3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_bootstrap_log'
      AND co.conname = 'evolution_bootstrap_log_status_check'
  ) THEN
    ALTER TABLE evo.evolution_bootstrap_log
      ADD CONSTRAINT evolution_bootstrap_log_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['ok','registered','failed','pending'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_bootstrap_log_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_bootstrap_log_status_check já existe — skip';
  END IF;
END $evo_3$;
ALTER TABLE evo.evolution_bootstrap_log VALIDATE CONSTRAINT evolution_bootstrap_log_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 4: evolution_broadcasts.status
-- ---------------------------------------------------------------------------
DO $evo_4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_broadcasts'
      AND co.conname = 'evolution_broadcasts_status_check'
  ) THEN
    ALTER TABLE evo.evolution_broadcasts
      ADD CONSTRAINT evolution_broadcasts_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['draft','scheduled','active','paused','completed','cancelled','failed'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_broadcasts_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_broadcasts_status_check já existe — skip';
  END IF;
END $evo_4$;
ALTER TABLE evo.evolution_broadcasts VALIDATE CONSTRAINT evolution_broadcasts_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 5: evolution_campaign_recipients.status
-- ---------------------------------------------------------------------------
DO $evo_5$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_campaign_recipients'
      AND co.conname = 'evolution_campaign_recipients_status_check'
  ) THEN
    ALTER TABLE evo.evolution_campaign_recipients
      ADD CONSTRAINT evolution_campaign_recipients_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','sent','delivered','read','failed','skipped','cancelled'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_campaign_recipients_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_campaign_recipients_status_check já existe — skip';
  END IF;
END $evo_5$;
ALTER TABLE evo.evolution_campaign_recipients VALIDATE CONSTRAINT evolution_campaign_recipients_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 6: evolution_campaigns.status
-- ---------------------------------------------------------------------------
DO $evo_6$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_campaigns'
      AND co.conname = 'evolution_campaigns_status_check'
  ) THEN
    ALTER TABLE evo.evolution_campaigns
      ADD CONSTRAINT evolution_campaigns_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['draft','active','paused','completed','cancelled'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_campaigns_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_campaigns_status_check já existe — skip';
  END IF;
END $evo_6$;
ALTER TABLE evo.evolution_campaigns VALIDATE CONSTRAINT evolution_campaigns_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 7: evolution_followups.status
-- ---------------------------------------------------------------------------
DO $evo_7$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_followups'
      AND co.conname = 'evolution_followups_status_check'
  ) THEN
    ALTER TABLE evo.evolution_followups
      ADD CONSTRAINT evolution_followups_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['scheduled','pending','sent','delivered','cancelled','failed'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_followups_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_followups_status_check já existe — skip';
  END IF;
END $evo_7$;
ALTER TABLE evo.evolution_followups VALIDATE CONSTRAINT evolution_followups_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 8: evolution_group_participants.role
-- ---------------------------------------------------------------------------
DO $evo_8$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_group_participants'
      AND co.conname = 'evolution_group_participants_role_check'
  ) THEN
    ALTER TABLE evo.evolution_group_participants
      ADD CONSTRAINT evolution_group_participants_role_check
      CHECK (
        role IS NULL
        OR role = ANY(ARRAY['member','admin','superadmin'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_group_participants_role_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_group_participants_role_check já existe — skip';
  END IF;
END $evo_8$;
ALTER TABLE evo.evolution_group_participants VALIDATE CONSTRAINT evolution_group_participants_role_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 9: evolution_message_queue.status
-- ---------------------------------------------------------------------------
DO $evo_9$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_message_queue'
      AND co.conname = 'evolution_message_queue_status_check'
  ) THEN
    ALTER TABLE evo.evolution_message_queue
      ADD CONSTRAINT evolution_message_queue_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','processing','sent','delivered','failed','cancelled'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_message_queue_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_message_queue_status_check já existe — skip';
  END IF;
END $evo_9$;
ALTER TABLE evo.evolution_message_queue VALIDATE CONSTRAINT evolution_message_queue_status_check;

-- ---------------------------------------------------------------------------
-- EVO — DATA NORMALIZATION: evolution_messages_wpp2_archive
-- A tabela de arquivo contém valores raw da WA API (maiúsculos) que precisam
-- ser normalizados ANTES de adicionar os CHECK constraints.
--   DELIVERY_ACK → delivered  (WA API delivery ack = mesma semântica)
--   ERROR        → failed     (WA API error state = failed)
-- Produção auditada: 25 × DELIVERY_ACK, 5 × ERROR (total 30 linhas afetadas)
-- ---------------------------------------------------------------------------
UPDATE evo.evolution_messages_wpp2_archive
  SET status = 'delivered'
  WHERE status = 'DELIVERY_ACK';

UPDATE evo.evolution_messages_wpp2_archive
  SET status = 'failed'
  WHERE status = 'ERROR';

-- ---------------------------------------------------------------------------
-- EVO — PARTES 10+11: evolution_messages_wpp2_archive (tabela regular independente)
-- Nota: relkind='r', sem pai — NÃO herda de evolution_messages.
-- Valores mapeados de evolution_messages_direction_check e _status_check (root).
-- ---------------------------------------------------------------------------
DO $evo_10$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_messages_wpp2_archive'
      AND co.conname = 'evolution_messages_wpp2_archive_direction_check'
  ) THEN
    ALTER TABLE evo.evolution_messages_wpp2_archive
      ADD CONSTRAINT evolution_messages_wpp2_archive_direction_check
      CHECK (
        direction IS NULL
        OR direction = ANY(ARRAY['inbound','outbound'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_messages_wpp2_archive_direction_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_messages_wpp2_archive_direction_check já existe — skip';
  END IF;
END $evo_10$;
ALTER TABLE evo.evolution_messages_wpp2_archive VALIDATE CONSTRAINT evolution_messages_wpp2_archive_direction_check;

DO $evo_11$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_messages_wpp2_archive'
      AND co.conname = 'evolution_messages_wpp2_archive_status_check'
  ) THEN
    ALTER TABLE evo.evolution_messages_wpp2_archive
      ADD CONSTRAINT evolution_messages_wpp2_archive_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY[
          'received','sent','delivered','read','deleted','pending','played','failed'
        ])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_messages_wpp2_archive_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_messages_wpp2_archive_status_check já existe — skip';
  END IF;
END $evo_11$;
ALTER TABLE evo.evolution_messages_wpp2_archive VALIDATE CONSTRAINT evolution_messages_wpp2_archive_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 12: evolution_mirror_media_queue.status (NOT NULL)
-- ---------------------------------------------------------------------------
DO $evo_12$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_mirror_media_queue'
      AND co.conname = 'evolution_mirror_media_queue_status_check'
  ) THEN
    ALTER TABLE evo.evolution_mirror_media_queue
      ADD CONSTRAINT evolution_mirror_media_queue_status_check
      CHECK (status = ANY(ARRAY['pending','processing','completed','failed']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_mirror_media_queue_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_mirror_media_queue_status_check já existe — skip';
  END IF;
END $evo_12$;
ALTER TABLE evo.evolution_mirror_media_queue VALIDATE CONSTRAINT evolution_mirror_media_queue_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 13: evolution_mirror_runs.status (NOT NULL, sem default)
-- ---------------------------------------------------------------------------
DO $evo_13$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_mirror_runs'
      AND co.conname = 'evolution_mirror_runs_status_check'
  ) THEN
    ALTER TABLE evo.evolution_mirror_runs
      ADD CONSTRAINT evolution_mirror_runs_status_check
      CHECK (status = ANY(ARRAY['pending','running','completed','failed','error']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_mirror_runs_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_mirror_runs_status_check já existe — skip';
  END IF;
END $evo_13$;
ALTER TABLE evo.evolution_mirror_runs VALIDATE CONSTRAINT evolution_mirror_runs_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 14: evolution_notification_log.status
-- ---------------------------------------------------------------------------
DO $evo_14$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_notification_log'
      AND co.conname = 'evolution_notification_log_status_check'
  ) THEN
    ALTER TABLE evo.evolution_notification_log
      ADD CONSTRAINT evolution_notification_log_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','sent','delivered','failed','error'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_notification_log_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_notification_log_status_check já existe — skip';
  END IF;
END $evo_14$;
ALTER TABLE evo.evolution_notification_log VALIDATE CONSTRAINT evolution_notification_log_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 15: evolution_notifications.status
-- Produção: 8664 × 'pending' — 'pending' incluso na constraint
-- ---------------------------------------------------------------------------
DO $evo_15$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_notifications'
      AND co.conname = 'evolution_notifications_status_check'
  ) THEN
    ALTER TABLE evo.evolution_notifications
      ADD CONSTRAINT evolution_notifications_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','sent','read','failed'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_notifications_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_notifications_status_check já existe — skip';
  END IF;
END $evo_15$;
ALTER TABLE evo.evolution_notifications VALIDATE CONSTRAINT evolution_notifications_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 16: evolution_scheduled_messages.status
-- ---------------------------------------------------------------------------
DO $evo_16$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_scheduled_messages'
      AND co.conname = 'evolution_scheduled_messages_status_check'
  ) THEN
    ALTER TABLE evo.evolution_scheduled_messages
      ADD CONSTRAINT evolution_scheduled_messages_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','sending','sent','failed','cancelled','expired'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_scheduled_messages_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_scheduled_messages_status_check já existe — skip';
  END IF;
END $evo_16$;
ALTER TABLE evo.evolution_scheduled_messages VALIDATE CONSTRAINT evolution_scheduled_messages_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 17: evolution_tasks.status
-- Produção: 6 × 'overdue' — incluso; código confirma 'pending','in_progress'
-- ---------------------------------------------------------------------------
DO $evo_17$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_tasks'
      AND co.conname = 'evolution_tasks_status_check'
  ) THEN
    ALTER TABLE evo.evolution_tasks
      ADD CONSTRAINT evolution_tasks_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['pending','in_progress','completed','cancelled','overdue'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_tasks_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_tasks_status_check já existe — skip';
  END IF;
END $evo_17$;
ALTER TABLE evo.evolution_tasks VALIDATE CONSTRAINT evolution_tasks_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 18: evolution_typebot_sessions.status
-- ---------------------------------------------------------------------------
DO $evo_18$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_typebot_sessions'
      AND co.conname = 'evolution_typebot_sessions_status_check'
  ) THEN
    ALTER TABLE evo.evolution_typebot_sessions
      ADD CONSTRAINT evolution_typebot_sessions_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY['active','paused','completed','expired','error'])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_typebot_sessions_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_typebot_sessions_status_check já existe — skip';
  END IF;
END $evo_18$;
ALTER TABLE evo.evolution_typebot_sessions VALIDATE CONSTRAINT evolution_typebot_sessions_status_check;

-- ---------------------------------------------------------------------------
-- EVO — PARTE 19: evolution_webhook_dlq.status (NOT NULL)
-- Fonte: fn_flag_poison_messages() seta 'poison' quando retry_count >= max_retries
-- Refs: 20260710200000_evo_dlq_poison_guard.sql
-- ---------------------------------------------------------------------------
DO $evo_19$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_webhook_dlq'
      AND co.conname = 'evolution_webhook_dlq_status_check'
  ) THEN
    ALTER TABLE evo.evolution_webhook_dlq
      ADD CONSTRAINT evolution_webhook_dlq_status_check
      CHECK (status = ANY(ARRAY['pending','poison']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK evolution_webhook_dlq_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK evolution_webhook_dlq_status_check já existe — skip';
  END IF;
END $evo_19$;
ALTER TABLE evo.evolution_webhook_dlq VALIDATE CONSTRAINT evolution_webhook_dlq_status_check;

-- ---------------------------------------------------------------------------
-- ZAPP — PARTE 1: conversation_participants.role (NOT NULL)
-- ---------------------------------------------------------------------------
DO $zapp_1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'conversation_participants'
      AND co.conname = 'conversation_participants_role_check'
  ) THEN
    ALTER TABLE zapp.conversation_participants
      ADD CONSTRAINT conversation_participants_role_check
      CHECK (role = ANY(ARRAY['observer','agent','supervisor','admin']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK conversation_participants_role_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK conversation_participants_role_check já existe — skip';
  END IF;
END $zapp_1$;
ALTER TABLE zapp.conversation_participants VALIDATE CONSTRAINT conversation_participants_role_check;

-- ---------------------------------------------------------------------------
-- ZAPP — PARTE 2: department_invitations.role (NOT NULL)
-- ---------------------------------------------------------------------------
DO $zapp_2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'department_invitations'
      AND co.conname = 'department_invitations_role_check'
  ) THEN
    ALTER TABLE zapp.department_invitations
      ADD CONSTRAINT department_invitations_role_check
      CHECK (role = ANY(ARRAY['member','admin','supervisor']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK department_invitations_role_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK department_invitations_role_check já existe — skip';
  END IF;
END $zapp_2$;
ALTER TABLE zapp.department_invitations VALIDATE CONSTRAINT department_invitations_role_check;

-- ---------------------------------------------------------------------------
-- ZAPP — PARTE 3: email_health_logs.status (NOT NULL)
-- Produção: 7 × 'error', 2 × 'healthy' — ambos inclusos
-- ---------------------------------------------------------------------------
DO $zapp_3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'email_health_logs'
      AND co.conname = 'email_health_logs_status_check'
  ) THEN
    ALTER TABLE zapp.email_health_logs
      ADD CONSTRAINT email_health_logs_status_check
      CHECK (status = ANY(ARRAY['healthy','warning','degraded','error','unknown']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK email_health_logs_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK email_health_logs_status_check já existe — skip';
  END IF;
END $zapp_3$;
ALTER TABLE zapp.email_health_logs VALIDATE CONSTRAINT email_health_logs_status_check;

-- ---------------------------------------------------------------------------
-- ZAPP — PARTE 4: notifications.type (NOT NULL)
-- Espelha app_notifications_type_check (validado em produção com 14283 rows)
-- ---------------------------------------------------------------------------
DO $zapp_4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'notifications'
      AND co.conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE zapp.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (
        type = ANY(ARRAY[
          'info','warning','error','success',
          'sla_breach','new_message','assignment','mention'
        ])
      ) NOT VALID;
    RAISE NOTICE '[v14] CHECK notifications_type_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK notifications_type_check já existe — skip';
  END IF;
END $zapp_4$;
ALTER TABLE zapp.notifications VALIDATE CONSTRAINT notifications_type_check;

-- ---------------------------------------------------------------------------
-- ZAPP — PARTE 5: provider_message_log.direction (NOT NULL)
-- Espelha calls_direction_check (mesmo conjunto de valores)
-- ---------------------------------------------------------------------------
DO $zapp_5$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'provider_message_log'
      AND co.conname = 'provider_message_log_direction_check'
  ) THEN
    ALTER TABLE zapp.provider_message_log
      ADD CONSTRAINT provider_message_log_direction_check
      CHECK (direction = ANY(ARRAY['inbound','outbound']))
      NOT VALID;
    RAISE NOTICE '[v14] CHECK provider_message_log_direction_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v14] CHECK provider_message_log_direction_check já existe — skip';
  END IF;
END $zapp_5$;
ALTER TABLE zapp.provider_message_log VALIDATE CONSTRAINT provider_message_log_direction_check;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ---------------------------------------------------------------------------
DO $verify_v14$
DECLARE
  v_not_valid    integer;
  v_new_evo      integer;
  v_new_zapp     integer;
BEGIN
  -- Zero NOT VALID em zapp+evo após migration
  SELECT COUNT(*) INTO v_not_valid
  FROM pg_constraint co
  JOIN pg_class c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND NOT co.convalidated
    AND n.nspname IN ('zapp','evo');

  -- 19 novos CHECK em evo
  SELECT COUNT(DISTINCT co.conname) INTO v_new_evo
  FROM pg_constraint co
  JOIN pg_class c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND n.nspname = 'evo'
    AND co.conname IN (
      'evolution_automation_logs_status_check',
      'evolution_bitrix_queue_status_check',
      'evolution_bootstrap_log_status_check',
      'evolution_broadcasts_status_check',
      'evolution_campaign_recipients_status_check',
      'evolution_campaigns_status_check',
      'evolution_followups_status_check',
      'evolution_group_participants_role_check',
      'evolution_message_queue_status_check',
      'evolution_messages_wpp2_archive_direction_check',
      'evolution_messages_wpp2_archive_status_check',
      'evolution_mirror_media_queue_status_check',
      'evolution_mirror_runs_status_check',
      'evolution_notification_log_status_check',
      'evolution_notifications_status_check',
      'evolution_scheduled_messages_status_check',
      'evolution_tasks_status_check',
      'evolution_typebot_sessions_status_check',
      'evolution_webhook_dlq_status_check'
    );

  -- 5 novos CHECK em zapp
  SELECT COUNT(DISTINCT co.conname) INTO v_new_zapp
  FROM pg_constraint co
  JOIN pg_class c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND n.nspname = 'zapp'
    AND co.conname IN (
      'conversation_participants_role_check',
      'department_invitations_role_check',
      'email_health_logs_status_check',
      'notifications_type_check',
      'provider_message_log_direction_check'
    );

  RAISE NOTICE '[v14] VERIFY: NOT VALID=% | evo novos=%/19 | zapp novos=%/5',
    v_not_valid, v_new_evo, v_new_zapp;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v14] FALHA: % constraint(s) NOT VALID após migration!', v_not_valid;
  END IF;

  IF v_new_evo < 19 THEN
    RAISE EXCEPTION '[v14] FALHA: apenas %/19 constraints evo confirmados!', v_new_evo;
  END IF;

  IF v_new_zapp < 5 THEN
    RAISE EXCEPTION '[v14] FALHA: apenas %/5 constraints zapp confirmados!', v_new_zapp;
  END IF;

  RAISE NOTICE '[v14] ✓ Migration v14 aplicada com sucesso. 24 novos CHECK constraints validados.';
END $verify_v14$;
