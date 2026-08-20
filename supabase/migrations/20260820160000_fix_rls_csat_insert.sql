-- ============================================================================
-- FIX RLS (2026-08-20) — zapp.csat_surveys_insert (classe do bug badges/whisper)
-- ----------------------------------------------------------------------------
-- csat_surveys.agent_id é FK → zapp.profiles.id, mas a policy WITH CHECK
-- comparava agent_id = auth.uid() (auth users.id). profiles.id != auth.users.id
-- → agente não conseguia INSERIR seu próprio CSAT. O update (#1309) já foi
-- corrigido; este completa o par (insert ainda tinha o bug).
-- ============================================================================
DROP POLICY IF EXISTS csat_surveys_insert ON zapp.csat_surveys;
SELECT ops.safe_create_policy(
  'zapp', 'csat_surveys', 'csat_surveys_insert',
  'FOR INSERT TO authenticated WITH CHECK (
     agent_id = zapp.get_profile_id_for_user(auth.uid())
     OR zapp.is_admin_or_supervisor(auth.uid())
   )'
);
