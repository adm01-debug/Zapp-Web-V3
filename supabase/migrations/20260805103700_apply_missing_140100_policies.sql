-- ============================================================================
-- Migration: apply_missing_140100_policies
-- Data:      2026-08-05
-- Objetivo:  Aplicar as policies FALTANTES da migration 20260804140100
--            (fix_rls_critical_follow_up.sql) que foi aplicada apenas
--            PARCIALMENTE à mão em produção.
--
-- GAP ENCONTRADO NA AUDITORIA 10 AGENTES (2026-08-05, Auditor de Migrations/DR):
--   - zapp.audit_logs SEM policy de INSERT → os 5 call-sites de auditoria
--     (citados na própria 140100) perdiam dados silenciosamente.
--   - zapp.warroom_alerts com só 2 policies legadas (FOR ALL) → qualquer
--     authenticated podia DELETAR alertas de segurança (supressão de incidente).
--   - auth_secure_134 em zapp.queues não dropado (F-07 da 140100).
--   - voice_conversion_queue: a 140100 mira public.* (DO block condicional);
--     a tabela REAL é zapp.* — garantir voice_insert.
--
-- Aplicada em produção como 20260805103705 (transactional).
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- ============================================================================

-- ── P-04: audit_logs_insert ────────────────────────────────────────────────
-- Users insert audit rows scoped to themselves (or their profile id), admins any.
DROP POLICY IF EXISTS audit_logs_insert ON zapp.audit_logs;
CREATE POLICY audit_logs_insert ON zapp.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR user_id = auth.uid()
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ── P-05: warroom_alerts — split policies (substitui FOR ALL legado) ────────
DROP POLICY IF EXISTS warroom_alerts_select_insert ON zapp.warroom_alerts;
DROP POLICY IF EXISTS warroom_alerts_insert_policy ON zapp.warroom_alerts;
DROP POLICY IF EXISTS warroom_alerts_admin_write ON zapp.warroom_alerts;
DROP POLICY IF EXISTS warroom_alerts_admin_delete ON zapp.warroom_alerts;

CREATE POLICY warroom_alerts_select_insert ON zapp.warroom_alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY warroom_alerts_insert_policy ON zapp.warroom_alerts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY warroom_alerts_admin_write ON zapp.warroom_alerts
  FOR UPDATE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

CREATE POLICY warroom_alerts_admin_delete ON zapp.warroom_alerts
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ── F-07: drop auth_secure_134 redundante (queues_select já cobre) ─────────
DROP POLICY IF EXISTS auth_secure_134 ON zapp.queues;

-- ── F-06: voice_conversion_queue — garantir INSERT na tabela real (zapp) ───
DROP POLICY IF EXISTS voice_insert ON zapp.voice_conversion_queue;
CREATE POLICY voice_insert ON zapp.voice_conversion_queue
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- FIM — policies da 140100 completas em produção (2026-08-05).
-- ============================================================================
