-- 20260817260000 — AutoExport (G4): jobs de exportação + bucket privado zapp-exports
-- =============================================================================
-- Objetivo: registrar jobs de exportação automática (CSV/JSON) executados pela
-- edge function `zapp-auto-export`. Cada job referencia uma tabela do schema
-- zapp (allowlist), formato e filtros opcionais. A edge gera o arquivo, grava
-- no storage PRIVADO (bucket `zapp-exports`) e devolve uma signed URL
-- temporária para download.
--
-- Segurança (LGPD): RLS ADMIN-ONLY em TODAS as operações
-- (SELECT/INSERT/UPDATE/DELETE via zapp.is_admin_or_supervisor) — jobs de
-- exportação expõem dados em massa. Acesso ao arquivo só via signed URL
-- gerada pela edge (service_role) — o bucket é privado, sem policy de leitura
-- para anon/authenticated.
--
-- Rollback:
--   DROP TABLE zapp.auto_export_jobs;
--   DELETE FROM storage.buckets WHERE name = 'zapp-exports';
--   (GRANTs são inócuos de reverter)

BEGIN;

-- ── Tabela de jobs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.auto_export_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  source_table  text NOT NULL CHECK (source_table IN ('contacts','messages','conversations','campaigns','scheduled_messages')),
  format        text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','json')),
  filters       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  file_path     text,
  row_count     integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  last_run_at   timestamptz,
  last_error    text,
  created_by    uuid REFERENCES zapp.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zapp.auto_export_jobs IS
  'AutoExport (G4): jobs de exportação CSV/JSON via edge zapp-auto-export. Arquivos em storage privado zapp-exports; acesso via signed URL. RLS admin-only.';
COMMENT ON COLUMN zapp.auto_export_jobs.source_table IS
  'Tabela do schema zapp a exportar (allowlist replicada na edge zapp-auto-export).';
COMMENT ON COLUMN zapp.auto_export_jobs.filters IS
  'Filtros opcionais aplicados como igualdade na query (ex.: {"status": "active"}).';
COMMENT ON COLUMN zapp.auto_export_jobs.file_path IS
  'Caminho do objeto gerado no bucket zapp-exports (última execução com dados).';

-- ── RLS admin-only (todas as operações) ──────────────────────────────────────
ALTER TABLE zapp.auto_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auto_export_jobs_select ON zapp.auto_export_jobs;
CREATE POLICY auto_export_jobs_select ON zapp.auto_export_jobs
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS auto_export_jobs_insert ON zapp.auto_export_jobs;
CREATE POLICY auto_export_jobs_insert ON zapp.auto_export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS auto_export_jobs_update ON zapp.auto_export_jobs;
CREATE POLICY auto_export_jobs_update ON zapp.auto_export_jobs
  FOR UPDATE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS auto_export_jobs_delete ON zapp.auto_export_jobs;
CREATE POLICY auto_export_jobs_delete ON zapp.auto_export_jobs
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ── GRANTs (lição incidente PR #668: policy sem GRANT = 403) ────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.auto_export_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(uuid) TO authenticated;

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auto_export_jobs_status
  ON zapp.auto_export_jobs (status);

CREATE INDEX IF NOT EXISTS idx_auto_export_jobs_created_by
  ON zapp.auto_export_jobs (created_by);

-- ── Bucket PRIVADO zapp-exports (idempotente) ────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('zapp-exports', 'zapp-exports', false, 52428800,
        ARRAY['text/csv', 'application/json', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

-- ── Canário RLS (padrão etapa44/65: SET ROLE authenticated + JWT fake) ───────
DO $$
DECLARE
  v_admin_uid uuid := '00000000-0000-0000-0000-00000000d001';
  v_agent_uid uuid := '00000000-0000-0000-0000-00000000d002';
  v_admin_profile uuid;
  v_job_id uuid;
BEGIN
  -- Setup como OWNER (sem RLS): profiles + user_role admin do canário.
  -- [FIX 2026-08-18] usuários canário em auth.users (FK real de profiles).
  INSERT INTO auth.users (id, aud, role, email)
  VALUES
    (v_admin_uid, 'authenticated', 'authenticated', 'canario-d001@invalid.local'),
    (v_agent_uid, 'authenticated', 'authenticated', 'canario-d002@invalid.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO zapp.profiles (id, user_id) VALUES (gen_random_uuid(), v_admin_uid)
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id INTO v_admin_profile;
  INSERT INTO zapp.user_roles (user_id, role) VALUES (v_admin_uid, 'admin')
    ON CONFLICT DO NOTHING;
  INSERT INTO zapp.profiles (id, user_id) VALUES (gen_random_uuid(), v_agent_uid)
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id;

  -- Canário como authenticated (JWT = admin).
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);

  -- INSERT como admin deve passar.
  INSERT INTO zapp.auto_export_jobs (name, source_table, format, created_by)
    VALUES ('Canario Export', 'contacts', 'csv', v_admin_profile)
    RETURNING id INTO v_job_id;

  -- UPDATE do admin deve passar.
  UPDATE zapp.auto_export_jobs SET status = 'completed', updated_at = now() WHERE id = v_job_id;

  -- SELECT do admin deve enxergar a row.
  PERFORM 1 FROM zapp.auto_export_jobs WHERE id = v_job_id;

  -- JWT = agente (não-admin).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent_uid, 'role', 'authenticated')::text, true);

  -- INSERT de não-admin deve falhar (RLS bloqueia).
  BEGIN
    INSERT INTO zapp.auto_export_jobs (name, source_table, format, created_by)
      VALUES ('Canario Forbidden', 'contacts', 'csv', NULL);
    RAISE EXCEPTION 'canário falhou: agente conseguiu inserir job de exportação';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado: new row violates row-level security policy
  END;

  -- SELECT de não-admin não deve enxergar rows do admin.
  IF EXISTS (SELECT 1 FROM zapp.auto_export_jobs WHERE id = v_job_id) THEN
    RAISE EXCEPTION 'canário falhou: agente enxergou job do admin';
  END IF;

  -- UPDATE de não-admin deve afetar 0 rows (RLS filtra).
  UPDATE zapp.auto_export_jobs SET status = 'failed' WHERE id = v_job_id;
  IF FOUND THEN
    RAISE EXCEPTION 'canário falhou: agente atualizou job do admin';
  END IF;

  -- Limpeza (como owner).
  RESET ROLE;
  DELETE FROM zapp.auto_export_jobs WHERE id = v_job_id;
  DELETE FROM zapp.profiles WHERE user_id IN (v_admin_uid, v_agent_uid); -- cascade em user_roles
  DELETE FROM auth.users WHERE id IN (v_admin_uid, v_agent_uid);
END $$;

COMMIT;
