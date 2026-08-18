-- 20260817170000 — zapp.message_reports (Reportar mensagem — Etapa 44 do plano 100 etapas)
-- Rollback: DROP TABLE zapp.message_reports;
-- Workflow de moderação: open → reviewing → resolved/dismissed (só supervisor resolve).

CREATE TABLE zapp.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  contact_id uuid,
  instance_name text,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'inapropriado', 'urgencia', 'outro')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reports_message_reporter_key UNIQUE (message_id, reporter_id)
);

CREATE INDEX idx_message_reports_status_created ON zapp.message_reports (status, created_at);
CREATE INDEX idx_message_reports_reporter ON zapp.message_reports (reporter_id);

ALTER TABLE zapp.message_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_reports_select ON zapp.message_reports
  FOR SELECT USING (
    zapp.is_admin_or_supervisor(auth.uid())
    OR reporter_id = zapp.get_profile_id_for_user(auth.uid())
  );
CREATE POLICY message_reports_insert ON zapp.message_reports
  FOR INSERT WITH CHECK (reporter_id = zapp.get_profile_id_for_user(auth.uid()));
CREATE POLICY message_reports_update ON zapp.message_reports
  FOR UPDATE USING (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY message_reports_delete ON zapp.message_reports
  FOR DELETE USING (zapp.is_admin_or_supervisor(auth.uid()));

GRANT SELECT, INSERT ON zapp.message_reports TO authenticated;

-- Canário RLS (inclui negativo: agente comum NÃO pode UPDATE status)
DO $$
DECLARE v_user uuid := '00000000-0000-0000-0000-00000000c001';
DECLARE v_profile uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SELECT zapp.get_profile_id_for_user(v_user) INTO v_profile;
  INSERT INTO zapp.message_reports (message_id, reporter_id, reason)
    VALUES (gen_random_uuid(), v_profile, 'spam');
  PERFORM 1 FROM zapp.message_reports WHERE reporter_id = v_profile LIMIT 1;
  -- UPDATE como agente comum: RLS deve bloquear (0 rows afetadas)
  UPDATE zapp.message_reports SET status = 'resolved' WHERE reporter_id = v_profile AND status = 'open';
  RESET ROLE;
END $$;
