-- ============================================================================
-- Etapa 66 — Relatórios Agendados (DASHBOARD-16): schema canônico + outbox
-- 2026-08-17 | DB-as-source: aplicado via MCP (supabase_apply_migration /
-- role postgres); este arquivo é o espelho versionado. Idempotente.
--
-- SIM-4 (sim-relatorios.md) → execução. Decisões-chave deste arquivo:
--   1. Estende zapp.scheduled_reports (canônica, 0 linhas) com config jsonb,
--      schedule, last_run_at, last_error, fail_count e CHECK format
--      ('csv','json','email') — 'email' mantido por compat com o hook
--      useScheduledReports.ts, que cria relatórios com format:'email'.
--   2. DROP da gêmea zapp.scheduled_report_configs (0 linhas, nunca
--      reconciliada — F2-06/SIM-4 §1). Único ref de código era o edge
--      send-scheduled-report, reescrito nesta branch para ler a OUTBOX.
--   3. RLS: policy admin_all via zapp.is_admin_or_supervisor (padrão repo).
--   4. Bucket storage privado zapp-reports (cabe na migration — storage.*
--      é tabela normal do mesmo Postgres; precedente: UPDATE storage.buckets
--      em 20260804000000).
--   5. Tabela zapp.scheduled_report_runs = auditoria + DLQ + OUTBOX:
--      a fn de geração grava o conteúdo (CSV/JSON) AQUI; a edge
--      send-scheduled-report claima runs pendentes, faz upload do blob via
--      Storage API (self-hosted: o storage-api é dono dos blobs — INSERT
--      direto em storage.objects criaria objeto-fantasma, ver
--      cleanup-storage-orphans), gera signed URL e envia email.
--
-- Rollback:
--   DROP TABLE IF EXISTS zapp.scheduled_report_runs;
--   ALTER TABLE zapp.scheduled_reports DROP COLUMN IF EXISTS config,
--     DROP COLUMN IF EXISTS schedule, DROP COLUMN IF EXISTS last_run_at,
--     DROP COLUMN IF EXISTS last_error, DROP COLUMN IF EXISTS fail_count;
--   ALTER TABLE zapp.scheduled_reports DROP CONSTRAINT IF EXISTS scheduled_reports_format_check;
--   DROP POLICY IF EXISTS scheduled_reports_admin_all ON zapp.scheduled_reports;
--   DROP POLICY IF EXISTS scheduled_report_runs_select ON zapp.scheduled_report_runs;
--   DROP POLICY IF EXISTS scheduled_report_runs_admin_all ON zapp.scheduled_report_runs;
--   DELETE FROM storage.buckets WHERE id = 'zapp-reports';
-- ============================================================================

BEGIN;

-- ── 1. Estender zapp.scheduled_reports (canônica) ──────────────────────────
ALTER TABLE zapp.scheduled_reports
  ADD COLUMN IF NOT EXISTS config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule    text,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error  text,
  ADD COLUMN IF NOT EXISTS fail_count  integer NOT NULL DEFAULT 0;

-- CHECK format (csv|json|email) — idempotente (DO block evita erro de
-- constraint já existente em re-aplicação)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_reports_format_check'
      AND conrelid = 'zapp.scheduled_reports'::regclass
  ) THEN
    ALTER TABLE zapp.scheduled_reports
      ADD CONSTRAINT scheduled_reports_format_check
      CHECK (format IN ('csv', 'json', 'email'));
  END IF;
END $$;

COMMENT ON COLUMN zapp.scheduled_reports.config IS
  'jsonb {sql, params, bucket, retention_days} — sql = query read-only do relatório (admin-only, validada na execução)';
COMMENT ON COLUMN zapp.scheduled_reports.schedule IS
  'Expressão cron (ex.: 0 8 * * *) OU keyword daily|weekly|monthly — usado p/ calcular next_send_at';
COMMENT ON COLUMN zapp.scheduled_reports.fail_count IS
  'Circuit breaker: >=5 desativa o relatório (is_active=false) e notifica via last_error';

-- ── 2. DROP da gêmea zapp.scheduled_report_configs ─────────────────────────
-- SIM-4 §1: criada 2026-03-18, nunca reconciliada, 0 linhas. Único código que
-- a lia era o edge send-scheduled-report (reescrito p/ outbox nesta branch).
-- Sem CASCADE: se houver FK inesperada no DB vivo, o DROP falha ruidosamente
-- (melhor que apagar dependência silenciosamente).
DROP POLICY IF EXISTS scheduled_report_configs_select ON zapp.scheduled_report_configs;
DROP TABLE IF EXISTS zapp.scheduled_report_configs;

-- ── 3. Tabela de runs: auditoria + DLQ + OUTBOX ────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.scheduled_report_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      uuid NOT NULL REFERENCES zapp.scheduled_reports(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('success','error','skipped_lock','sending','expired_url')),
  error          text,
  storage_path   text,
  signed_url     text,
  row_count      integer,
  content        text,          -- OUTBOX: artefato CSV/JSON gerado pela fn
  delivered_at   timestamptz,   -- edge marca quando o email saiu
  send_attempts  integer NOT NULL DEFAULT 0,
  send_error     text,
  claimed_at     timestamptz,   -- edge claima (status='sending')
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_runs_report
  ON zapp.scheduled_report_runs (report_id, started_at DESC);

-- Outbox: runs prontos p/ envio (claim da edge)
CREATE INDEX IF NOT EXISTS idx_report_runs_outbox
  ON zapp.scheduled_report_runs (started_at)
  WHERE status = 'success' AND delivered_at IS NULL;

ALTER TABLE zapp.scheduled_report_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE zapp.scheduled_report_runs IS
  'Auditoria + DLQ + outbox dos relatórios agendados. A fn gera o conteúdo aqui; a edge send-scheduled-report claima (SKIP LOCKED), faz upload p/ storage zapp-reports, gera signed URL e envia email.';

-- ── 4. RLS ─────────────────────────────────────────────────────────────────
-- Admin/supervisor: acesso total a todos os relatórios (padrão repo)
DROP POLICY IF EXISTS scheduled_reports_admin_all ON zapp.scheduled_reports;
CREATE POLICY scheduled_reports_admin_all ON zapp.scheduled_reports
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

-- Runs: SELECT p/ dono (via report.created_by) OU admin/supervisor
DROP POLICY IF EXISTS scheduled_report_runs_select ON zapp.scheduled_report_runs;
CREATE POLICY scheduled_report_runs_select ON zapp.scheduled_report_runs
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())
         OR EXISTS (SELECT 1 FROM zapp.scheduled_reports r
                    WHERE r.id = report_id AND r.created_by =
                      (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())));

-- Admin: visão completa das runs (auditoria/DLQ)
DROP POLICY IF EXISTS scheduled_report_runs_admin_all ON zapp.scheduled_report_runs;
CREATE POLICY scheduled_report_runs_admin_all ON zapp.scheduled_report_runs
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

-- ── 5. Grants (padrão csat: explícitos e idempotentes) ─────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.scheduled_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.scheduled_report_runs TO authenticated;
GRANT ALL ON zapp.scheduled_report_runs TO service_role;

-- ── 6. Bucket privado zapp-reports ─────────────────────────────────────────
-- Storage ops CABEM na migration (storage.buckets é tabela do mesmo PG).
-- Privado: sem policy p/ anon/authenticated — acesso só via signed URL (7d)
-- gerada pela edge. Escrita: service_role (edge) / bypass RLS.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('zapp-reports', 'zapp-reports', false, 52428800,
        ARRAY['text/csv', 'application/json', 'text/html'])
ON CONFLICT (id) DO NOTHING;

-- Defesa explícita p/ service_role (redundante com BYPASSRLS, mas documenta o
-- contrato — padrão do repo em storage.objects)
DROP POLICY IF EXISTS reports_storage_admin_all ON storage.objects;
CREATE POLICY reports_storage_admin_all ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'zapp-reports')
  WITH CHECK (bucket_id = 'zapp-reports');

COMMIT;
