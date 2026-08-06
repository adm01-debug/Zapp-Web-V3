-- ============================================================================
-- DB-03 — FIX zapp.fn_register_instance: INSERT → zapp.instance_registry;
--         step de partição de webhook REMOVIDO
-- ============================================================================
-- Tipo   : FIX (correção de drift DB-03, execução autorizada em produção)
-- Data   : 2026-08-06
-- Design : .hermes/audit-zapp-refs/sql/fn_register_instance.sql (verbatim)
-- Baseline (corpo anterior): .hermes/audit-zapp-refs/baselines/20260806_fn_register_instance.sql
--
-- PROBLEMA (drift DB × runtime evidenciado em phase-06):
--   1. O corpo apontava INSERT INTO evo.instance_registry — tabela INEXISTENTE
--      (a tabela canônica é zapp.instance_registry) → chamadas falhavam com
--      "relation evo.instance_registry does not exist".
--   2. Criava partição de evo.evolution_webhook_events — tabela INEXISTENTE;
--      a tabela real é evo.evolution_webhook_events_v2, particionada RANGE
--      (created_at) — PARTITION OF ... FOR VALUES IN (...) é inválido para
--      parent RANGE. As partições mensais de _v2 são criadas pelo cron
--      "auto-create-monthly-partitions" (cron.job jobid=64 →
--      evo.fn_auto_create_next_partitions(), mês atual + próximo).
--
-- MUDANÇAS em relação ao corpo anterior (pg_get_functiondef 2026-08-05):
--   1. INSERT INTO evo.instance_registry  →  INSERT INTO zapp.instance_registry
--      (tabela canônica; colunas compatíveis).
--   2. Step de partição de webhook REMOVIDO (nada a fazer aqui: _v2 é RANGE
--      e é gerenciada pelo cron de partições mensais).
--   3. Steps de evolution_messages / evolution_conversations MANTIDOS
--      (parents LIST (instance_name) válidos).
--   4. Índices, RLS e policies mantidos exatamente como no corpo atual.
--
-- ROLLBACK: aplicar o corpo do baseline (reverso) — ver seção no fim do arquivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_register_instance(
  p_instance_name  character varying,
  p_display_name   character varying,
  p_phone          character varying,
  p_department     character varying,
  p_responsible    character varying DEFAULT NULL::character varying
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_id UUID; v_part_msgs TEXT; v_part_conv TEXT;
BEGIN
  -- Registrar instância na tabela canônica zapp.instance_registry.
  -- DB-03: o corpo antigo apontava para evo.instance_registry (inexistente),
  -- o que fazia a chamada falhar com "relation evo.instance_registry does not exist".
  INSERT INTO zapp.instance_registry (instance_name, display_name, phone_number, department, responsible_name)
  VALUES (p_instance_name, p_display_name, p_phone, p_department, p_responsible)
  RETURNING id INTO v_id;

  -- Criar partições automaticamente (somente parents LIST por instance_name)
  v_part_msgs := 'evolution_messages_'       || replace(p_instance_name, '-', '_');
  v_part_conv := 'evolution_conversations_'  || replace(p_instance_name, '-', '_');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_messages FOR VALUES IN (%L)',
    v_part_msgs, p_instance_name
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_conversations FOR VALUES IN (%L)',
    v_part_conv, p_instance_name
  );

  -- Webhook events: NÃO criar partição aqui (DB-03).
  -- O step antigo apontava para evo.evolution_webhook_events (tabela inexistente).
  -- A tabela real é evo.evolution_webhook_events_v2, particionada por
  -- RANGE (created_at) — PARTITION OF ... FOR VALUES IN (...) é inválido para
  -- parent RANGE. As partições mensais de _v2 são gerenciadas pelo cron
  -- "auto-create-monthly-partitions" (cron.job jobid=64 ->
  -- evo.fn_auto_create_next_partitions()), que cria as partições do mês
  -- seguinte e do mês subsequente. Nada a fazer aqui.

  -- Índices nas novas partições de mensagens
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_rjid     ON evo.%I(remote_jid)',        replace(p_instance_name,'-','_'), v_part_msgs);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_created  ON evo.%I(created_at DESC)',   replace(p_instance_name,'-','_'), v_part_msgs);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_jid_act  ON evo.%I(remote_jid, created_at DESC) WHERE deleted_at IS NULL', replace(p_instance_name,'-','_'), v_part_msgs);

  -- RLS nas 2 partições filhas criadas
  EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_msgs);
  EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_conv);

  -- Policy: service_role apenas (não TO PUBLIC!)
  EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_msgs);
  EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_conv);

  -- Policy: authenticated com acesso operacional
  EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_msgs);
  EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_conv);

  RETURN v_id;
END;
$function$

-- ============================================================================
-- ROLLBACK (reverso via baseline .hermes/audit-zapp-refs/baselines/20260806_fn_register_instance.sql)
-- Aplicar MANUALMENTE como 1 statement, somente se necessário:
-- ============================================================================
-- CREATE OR REPLACE FUNCTION zapp.fn_register_instance(p_instance_name character varying, p_display_name character varying, p_phone character varying, p_department character varying, p_responsible character varying DEFAULT NULL::character varying)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'zapp', 'evo'
-- AS $function$
-- DECLARE
--   v_id UUID; v_part_msgs TEXT; v_part_events TEXT; v_part_conv TEXT;
-- BEGIN
--   -- Registrar instancia
--   INSERT INTO evo.instance_registry (instance_name, display_name, phone_number, department, responsible_name)
--   VALUES (p_instance_name, p_display_name, p_phone, p_department, p_responsible)
--   RETURNING id INTO v_id;
--
--   -- Criar partições automaticamente
--   v_part_msgs   := 'evolution_messages_'       || replace(p_instance_name, '-', '_');
--   v_part_events := 'evolution_webhook_events_' || replace(p_instance_name, '-', '_');
--   v_part_conv   := 'evolution_conversations_'  || replace(p_instance_name, '-', '_');
--
--   EXECUTE format(
--     'CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_messages FOR VALUES IN (%L)',
--     v_part_msgs, p_instance_name
--   );
--   EXECUTE format(
--     'CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_webhook_events FOR VALUES IN (%L)',
--     v_part_events, p_instance_name
--   );
--   EXECUTE format(
--     'CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_conversations FOR VALUES IN (%L)',
--     v_part_conv, p_instance_name
--   );
--
--   -- Índices nas novas partições
--   EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_rjid     ON evo.%I(remote_jid)',        replace(p_instance_name,'-','_'), v_part_msgs);
--   EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_created  ON evo.%I(created_at DESC)',   replace(p_instance_name,'-','_'), v_part_msgs);
--   EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_jid_act  ON evo.%I(remote_jid, created_at DESC) WHERE deleted_at IS NULL', replace(p_instance_name,'-','_'), v_part_msgs);
--
--   -- RLS nas 3 partições filhas
--   EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_msgs);
--   EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_events);
--   EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_conv);
--
--   -- Policy: service_role apenas (não TO PUBLIC!)
--   EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_msgs);
--   EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_events);
--   EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_conv);
--
--   -- Policy: authenticated com acesso operacional
--   EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_msgs);
--   EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_events);
--   EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_conv);
--
--   RETURN v_id;
-- END;
-- $function$
