-- =============================================================================
-- Migration v15: Schema Hardening — 4 CHECK constraints finais
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit — fase pós-v14 deep scan)
--
-- Candidatos confirmados após varredura exaustiva pós-v14:
--
--   1. zapp.whatsapp_cloud_webhook_pings.kind (NOT NULL, 173 rows em prod)
--      Valores observados: event(114), event_post(56), verification(3)
--      Protocolo WhatsApp Cloud API — conjunto fechado de 3 tipos de ping
--
--   2. zapp.sla_configurations.priority (NOT NULL, tabela vazia em prod)
--      Valores: critical/high/medium/low
--      Fonte: src/features/sla/hooks/useSLAConfigurations.ts PRIORITY_CONFIG
--      (objeto literal com exatamente 4 chaves, usado como único ponto de escrita)
--
--   3. zapp.conversation_tasks.priority (NOT NULL, tabela vazia em prod)
--      Valores: high/medium/low
--      Fonte: src/features/inbox/components/ConversationTasksPanel.tsx priorityConfig
--      (objeto literal com exatamente 3 chaves — 'critical' NÃO existe aqui)
--
--   4. zapp.crisis_room_alerts.severity (NOT NULL DEFAULT 'warning', tabela vazia)
--      Valores: ok/warning/critical
--      Fonte: src/features/admin/components/CrisisRoom.tsx:16
--        severity: 'ok' | 'warning' | 'critical'
--      (TypeScript union + ternário nesses 3 valores nas linhas 47,55,63)
--
-- Excluídos desta migration (investigados e descartados):
--   - evo.evolution_ef_logs.level          → tabela vazia; valores além de 'info'/'error' desconhecidos
--   - zapp.scheduled_reports.format        → tabela vazia; Edge Functions podem escrever valores desconhecidos
--   - zapp.conversation_threads.channel    → comentário SQL lista 4 valores mas canal é extensível (omnichannel)
--   - zapp.departments.whatsapp_mode       → NULLABLE, menor prioridade para hardening agora
--   - zapp.calls.status                    → calls_status_check JÁ EXISTE (confirmado via pg_constraint)
--   - zapp.whatsapp_cloud_webhook_pings.status → whatsapp_cloud_webhook_pings_status_check JÁ EXISTE
--   - zapp.conversation_tasks.status       → conversation_tasks_status_check JÁ EXISTE
--
-- Estratégia: NOT VALID + VALIDATE para zero downtime (padrão v8–v14)
-- Estado esperado pós-v15: zapp=156 CHECKs, evo=159 CHECKs, 0 NOT VALID
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: zapp.whatsapp_cloud_webhook_pings.kind
-- Tabela: base (relkind='r'), 173 linhas em produção, NOT NULL
-- Valores confirmados em prod: event(114), event_post(56), verification(3)
-- Protocolo WhatsApp Cloud API: conjunto fechado e estável
-- ---------------------------------------------------------------------------
DO $t1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class     c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'whatsapp_cloud_webhook_pings'
      AND co.conname = 'whatsapp_cloud_webhook_pings_kind_check'
  ) THEN
    ALTER TABLE zapp.whatsapp_cloud_webhook_pings
      ADD CONSTRAINT whatsapp_cloud_webhook_pings_kind_check
      CHECK (kind = ANY(ARRAY['event','event_post','verification']))
      NOT VALID;
    RAISE NOTICE '[v15] CHECK whatsapp_cloud_webhook_pings_kind_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v15] CHECK whatsapp_cloud_webhook_pings_kind_check já existe — skip';
  END IF;
END $t1$;

ALTER TABLE zapp.whatsapp_cloud_webhook_pings
  VALIDATE CONSTRAINT whatsapp_cloud_webhook_pings_kind_check;

-- ---------------------------------------------------------------------------
-- PARTE 2: zapp.sla_configurations.priority
-- Tabela: base (relkind='r'), vazia em produção, NOT NULL
-- Valores: critical/high/medium/low (PRIORITY_CONFIG em useSLAConfigurations.ts)
-- ---------------------------------------------------------------------------
DO $t2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class     c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'sla_configurations'
      AND co.conname = 'sla_configurations_priority_check'
  ) THEN
    ALTER TABLE zapp.sla_configurations
      ADD CONSTRAINT sla_configurations_priority_check
      CHECK (priority = ANY(ARRAY['critical','high','medium','low']))
      NOT VALID;
    RAISE NOTICE '[v15] CHECK sla_configurations_priority_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v15] CHECK sla_configurations_priority_check já existe — skip';
  END IF;
END $t2$;

ALTER TABLE zapp.sla_configurations
  VALIDATE CONSTRAINT sla_configurations_priority_check;

-- ---------------------------------------------------------------------------
-- PARTE 3: zapp.conversation_tasks.priority
-- Tabela: base (relkind='r'), vazia em produção, NOT NULL
-- Valores: high/medium/low (priorityConfig em ConversationTasksPanel.tsx)
-- NOTA: 'critical' NÃO existe aqui (diferente de sla_configurations!)
-- ---------------------------------------------------------------------------
DO $t3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class     c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'conversation_tasks'
      AND co.conname = 'conversation_tasks_priority_check'
  ) THEN
    ALTER TABLE zapp.conversation_tasks
      ADD CONSTRAINT conversation_tasks_priority_check
      CHECK (priority = ANY(ARRAY['high','medium','low']))
      NOT VALID;
    RAISE NOTICE '[v15] CHECK conversation_tasks_priority_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v15] CHECK conversation_tasks_priority_check já existe — skip';
  END IF;
END $t3$;

ALTER TABLE zapp.conversation_tasks
  VALIDATE CONSTRAINT conversation_tasks_priority_check;

-- ---------------------------------------------------------------------------
-- PARTE 4: zapp.crisis_room_alerts.severity
-- Tabela: base (relkind='r'), vazia em produção, NOT NULL DEFAULT 'warning'
-- Valores: ok/warning/critical (CrisisRoom.tsx:16 — TypeScript union)
-- ---------------------------------------------------------------------------
DO $t4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class     c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'crisis_room_alerts'
      AND co.conname = 'crisis_room_alerts_severity_check'
  ) THEN
    ALTER TABLE zapp.crisis_room_alerts
      ADD CONSTRAINT crisis_room_alerts_severity_check
      CHECK (severity = ANY(ARRAY['ok','warning','critical']))
      NOT VALID;
    RAISE NOTICE '[v15] CHECK crisis_room_alerts_severity_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v15] CHECK crisis_room_alerts_severity_check já existe — skip';
  END IF;
END $t4$;

ALTER TABLE zapp.crisis_room_alerts
  VALIDATE CONSTRAINT crisis_room_alerts_severity_check;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_not_valid   integer;
  v_new_checks  integer;
  v_total_zapp  integer;
  v_total_evo   integer;
BEGIN
  -- Zero NOT VALID em zapp+evo
  SELECT COUNT(*) INTO v_not_valid
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND NOT co.convalidated
    AND n.nspname IN ('zapp','evo');

  -- Os 4 novos CHECK devem estar validados
  SELECT COUNT(DISTINCT co.conname) INTO v_new_checks
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND co.conname IN (
      'whatsapp_cloud_webhook_pings_kind_check',
      'sla_configurations_priority_check',
      'conversation_tasks_priority_check',
      'crisis_room_alerts_severity_check'
    );

  -- Contagem total
  SELECT COUNT(*) INTO v_total_zapp
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c' AND n.nspname = 'zapp';

  SELECT COUNT(*) INTO v_total_evo
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c' AND n.nspname = 'evo';

  RAISE NOTICE '[v15] VERIFY: NOT VALID=% | novos CHECK validados=%/4 | total zapp=% | total evo=%',
    v_not_valid, v_new_checks, v_total_zapp, v_total_evo;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v15] FALHA: % constraint(s) NOT VALID após migration!', v_not_valid;
  END IF;

  IF v_new_checks < 4 THEN
    RAISE EXCEPTION '[v15] FALHA: apenas %/4 novos CHECK validados!', v_new_checks;
  END IF;

  RAISE NOTICE '[v15] ✓ Migration v15 aplicada com sucesso. Schema hardening completo.';
END $verify$;
