-- ==========================================================================
-- Guarda canônica fn_require_app_user v2 (membership real) + ALTER ROLE + cron policies
-- Espelho versionado da onda de correção executada em 2026-08-07 (DB-as-source:
-- objetos JÁ aplicados em produção via psql; esta migration é NO-OP idempotente
-- que alinha o repo com o banco canônico).
-- Fonte: .hermes/audit-db-exaustiva/20260807/ (exec-01..14, fix_*.sql)
-- ==========================================================================

-- COR-01 (P0): guarda canonica endurecida - exige membership real (profiles + user_roles OU workspace_members)
-- auth.uid() NULL (service_role, cron, edge) passa.
CREATE OR REPLACE FUNCTION zapp.fn_require_app_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM zapp.profiles WHERE user_id = auth.uid())
       OR NOT EXISTS (SELECT 1 FROM zapp.user_roles WHERE user_id = auth.uid())
       AND NOT EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: app member required' USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$function$

-- ALTER ROLE supabase_read_only_user NOROLBYPASSRLS (onda 2026-08-07, CORR-11)
ALTER ROLE supabase_read_only_user NOROLBYPASSRLS;
-- Policies de leitura do role de auditoria em cron.* (RLS username=CURRENT_USER)
DROP POLICY IF EXISTS ro_cron_job_readonly ON cron.job;
CREATE POLICY ro_cron_job_readonly ON cron.job FOR SELECT TO supabase_read_only_user USING (true);
DROP POLICY IF EXISTS ro_cron_run_readonly ON cron.job_run_details;
CREATE POLICY ro_cron_run_readonly ON cron.job_run_details FOR SELECT TO supabase_read_only_user USING (true);
