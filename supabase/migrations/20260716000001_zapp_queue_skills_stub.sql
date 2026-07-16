-- Migration: queue_skills stub
-- ---------------------------------------------------------------------------
-- A tabela queue_skills existe em produção mas nunca teve CREATE TABLE nas
-- migrations deste repo (criada manualmente). Esta migration cria a estrutura
-- mínima compatível com o uso atual (SELECT * em useAdminManagement.ts) usando
-- CREATE TABLE IF NOT EXISTS para não quebrar instâncias que já têm a tabela.
--
-- Schema de referência: src/features/admin/hooks/useAdminManagement.ts
--   interface QueueSkill { id, queue_id, skill_name, min_level }
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS zapp.queue_skills (
  id         UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id   UUID                     NOT NULL REFERENCES zapp.queues(id) ON DELETE CASCADE,
  skill_name TEXT                     NOT NULL CHECK (char_length(skill_name) BETWEEN 1 AND 100),
  min_level  INTEGER                  NOT NULL DEFAULT 1 CHECK (min_level BETWEEN 1 AND 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (queue_id, skill_name)
);

ALTER TABLE zapp.queue_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view queue_skills"
  ON zapp.queue_skills FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage queue_skills"
  ON zapp.queue_skills FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

GRANT SELECT ON zapp.queue_skills TO authenticated;
GRANT ALL    ON zapp.queue_skills TO service_role;
