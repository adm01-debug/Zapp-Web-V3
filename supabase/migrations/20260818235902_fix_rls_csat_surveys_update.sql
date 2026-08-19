-- ============================================================================
-- FIX RLS (2026-08-18) — zapp.csat_surveys_update (classe do bug badges/whisper)
-- ----------------------------------------------------------------------------
-- csat_surveys.agent_id é FK → zapp.profiles.id, mas a policy comparava
-- agent_id = auth.uid() (auth users.id). profiles.id != auth.users.id (3
-- perfis novos já divergentes) → agente não conseguia atualizar o próprio CSAT.
-- Fix: usar o helper canônico zapp.get_profile_id_for_user(auth.uid()).
-- ============================================================================
DROP POLICY IF EXISTS csat_surveys_update ON zapp.csat_surveys;
SELECT ops.safe_create_policy(
  'zapp', 'csat_surveys', 'csat_surveys_update',
  'FOR UPDATE TO authenticated USING (
     agent_id = zapp.get_profile_id_for_user(auth.uid())
     OR zapp.is_admin_or_supervisor(auth.uid())
   ) WITH CHECK (
     agent_id = zapp.get_profile_id_for_user(auth.uid())
     OR zapp.is_admin_or_supervisor(auth.uid())
   )'
);
