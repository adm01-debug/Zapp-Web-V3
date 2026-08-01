-- 20260801010002 — Integridade: enum warroom_alert_type + conversão da coluna (auditoria etapas 24-25)
-- Aplicado em produção: 2026-08-01
-- Backup: zapp._warroom_alerts_backup_20260801 (4.351 linhas)
-- Rollback:
--   DROP VIEW public.warroom_alerts;
--   ALTER TABLE zapp.warroom_alerts ALTER COLUMN alert_type TYPE text USING alert_type::text;
--   ALTER TABLE zapp.warroom_alerts ADD CONSTRAINT chk_warroom_alert_type
--     CHECK (alert_type = ANY (ARRAY['info','warning','critical','sla_breach']));
--   CREATE VIEW public.warroom_alerts WITH (security_invoker=true) AS SELECT ... FROM zapp.warroom_alerts;
--   DROP TYPE zapp.warroom_alert_type;

BEGIN;

-- 1. Remover view dependente (recreate ao final)
DROP VIEW public.warroom_alerts;

-- 2. Backup da tabela
CREATE TABLE IF NOT EXISTS zapp._warroom_alerts_backup_20260801 AS SELECT * FROM zapp.warroom_alerts;
ALTER TABLE zapp._warroom_alerts_backup_20260801 ENABLE ROW LEVEL SECURITY;

-- 3. Dropar CHECK text (o enum passa a validar o domínio)
ALTER TABLE zapp.warroom_alerts DROP CONSTRAINT IF EXISTS chk_warroom_alert_type;

-- 4. Criar enum (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE t.typname='warroom_alert_type' AND n.nspname='zapp') THEN
    CREATE TYPE zapp.warroom_alert_type AS ENUM ('info','warning','critical','sla_breach');
  END IF;
END $$;

-- 5. Converter coluna (domínio verificado: apenas info/critical/warning presentes)
ALTER TABLE zapp.warroom_alerts ALTER COLUMN alert_type TYPE zapp.warroom_alert_type
  USING alert_type::zapp.warroom_alert_type;

-- 6. Recriar view com security_invoker + grants
CREATE VIEW public.warroom_alerts WITH (security_invoker=true) AS
  SELECT warroom_alerts.alert_type, warroom_alerts.created_at, warroom_alerts.dismissed_by,
         warroom_alerts.id, warroom_alerts.is_read, warroom_alerts.message,
         warroom_alerts.resolved_at, warroom_alerts.resolved_reason, warroom_alerts.source,
         warroom_alerts.title, warroom_alerts.entity
  FROM zapp.warroom_alerts;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warroom_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.warroom_alerts TO service_role;

COMMIT;
