-- 20260818120000 — RLS hardening batch (simulação R3-FINAL, 2026-08-18)
-- =============================================================================
-- Fecha policies USING(true)/WITH CHECK(true) abertas, seguindo o plano
-- item-a-item da simulação R3-FINAL, AJUSTADO aos fatos do banco real
-- (schemas/colunas verificados via pg_policies/information_schema em
-- 2026-08-18 — o plano da simulação tinha erros de schema; o banco é a
-- fonte da verdade).
--
-- Padrão canônico: zapp.workspace_members (member) / zapp.is_admin_or_supervisor
-- / dono do registro. ADITIVA + idempotente (DROP IF EXISTS + CREATE).
-- Rollback: recriar a policy anterior (registrada no r3-final.json).
--
-- GRUPO B (MÉDIO+BAIXO do plano; itens 4-15 ajustados). Grupo A (partições
-- evo + bpm baseline) segue em migration própria.

BEGIN;

-- [4/5] zapp.warroom_alerts: SELECT/INSERT escopados a membros do workspace
DROP POLICY IF EXISTS warroom_alerts_select_insert ON zapp.warroom_alerts;
CREATE POLICY warroom_alerts_select_insert ON zapp.warroom_alerts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS warroom_alerts_insert_policy ON zapp.warroom_alerts;
CREATE POLICY warroom_alerts_insert_policy ON zapp.warroom_alerts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()));

-- [6] zapp.csat_surveys: substituir csat_service_all (ALL qual=true) por
--     policies escopadas (leitura members; escrita dono/admin; DELETE admin).
--     service_role (edge csat) continua com bypass — fluxo intacto.
DROP POLICY IF EXISTS csat_service_all ON zapp.csat_surveys;
CREATE POLICY csat_surveys_select ON zapp.csat_surveys
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY csat_surveys_insert ON zapp.csat_surveys
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY csat_surveys_update ON zapp.csat_surveys
  FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (agent_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY csat_surveys_delete ON zapp.csat_surveys
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- [10/11] zapp.voice_conversion_queue: INSERT/UPDATE/SELECT dono (requested_by)
--     (fato real: coluna é requested_by, não user_id; schema é zapp)
--     [validação 2026-08-18] 3 policies LEGADAS para public (voice_select,
--     voice_update, voice_queue_all — auth.uid() IS NOT NULL) anulavam o
--     hardening — DROP + SELECT substituto escopado:
DROP POLICY IF EXISTS voice_queue_all ON zapp.voice_conversion_queue;
DROP POLICY IF EXISTS voice_select ON zapp.voice_conversion_queue;
DROP POLICY IF EXISTS voice_update ON zapp.voice_conversion_queue;
DROP POLICY IF EXISTS voice_insert ON zapp.voice_conversion_queue;
CREATE POLICY voice_conversion_queue_select ON zapp.voice_conversion_queue
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY voice_conversion_queue_insert ON zapp.voice_conversion_queue
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY voice_conversion_queue_update ON zapp.voice_conversion_queue
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (requested_by = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));

-- [13] evo.media_cache: SELECT members (fato real: policy é
--      media_cache_select_authenticated em evo, não public/media_cache_upsert)
DROP POLICY IF EXISTS media_cache_select_authenticated ON evo.media_cache;
CREATE POLICY media_cache_select_authenticated ON evo.media_cache
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()));

-- [14] zapp.queues: SELECT members (fato real: zapp.queues, não public)
DROP POLICY IF EXISTS authenticated_read_queues ON zapp.queues;
CREATE POLICY authenticated_read_queues ON zapp.queues
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()));

-- [15] zapp.evo_reconcile_contact_snapshot: SELECT members (fato real: schema zapp)
DROP POLICY IF EXISTS authenticated_read_reconcile_snapshot ON zapp.evo_reconcile_contact_snapshot;
CREATE POLICY authenticated_read_reconcile_snapshot ON zapp.evo_reconcile_contact_snapshot
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()));

COMMIT;
