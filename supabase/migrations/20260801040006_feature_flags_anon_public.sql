-- 20260801040006 — Governança: feature_flags anon restrito a is_public (auditoria etapa 40)
-- Aplicado em produção: 2026-08-01
-- Nenhuma flag marcada is_public=true (front não consome feature_flags diretamente).
-- Rollback:
--   DROP POLICY IF EXISTS feature_flags_anon_public ON zapp.feature_flags;
--   CREATE POLICY "Anon can read flags" ON zapp.feature_flags FOR SELECT TO anon USING (true);
--   ALTER TABLE zapp.feature_flags DROP COLUMN IF EXISTS is_public;

BEGIN;

ALTER TABLE zapp.feature_flags ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Anon can read flags" ON zapp.feature_flags;

CREATE POLICY feature_flags_anon_public ON zapp.feature_flags FOR SELECT TO anon USING (is_public);

COMMIT;
