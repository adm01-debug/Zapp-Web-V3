-- E20 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): medição dos invariantes contra o banco real.
-- RPC fechada, read-only, SECURITY DEFINER, EXECUTE só para service_role.
-- Substitui o endpoint inexistente {SUPABASE_URL}/pg/query que o boundary-audit.mjs tentava usar.
-- JÁ APLICADA em produção em 2026-08-15 via supabase_db_query + INSERT manual em
-- supabase_migrations.schema_migrations (workaround do supabase_apply_migration bugado).

CREATE OR REPLACE FUNCTION ops.fn_boundary_audit()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
SELECT jsonb_build_object(
  'measured_at', now(),
  'I1_fns_evo_citando_zapp', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='evo' AND p.prosrc ~* '\mzapp\.'),
  'I2_fns_zapp_citando_evo', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='zapp' AND p.prosrc ~* '\mevo\.'),
  'I3_fks_cruzadas', (
    SELECT count(DISTINCT c.conname) FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace tn ON tn.oid=t.relnamespace
    JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=r.relnamespace
    WHERE c.contype='f' AND tn.nspname IN ('evo','zapp') AND rn.nspname IN ('evo','zapp')
      AND tn.nspname<>rn.nspname),
  'I4_tabelas_evolution_fora_de_evo', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname IN ('evolution_messages','evolution_conversations','evolution_contacts')
      AND c.relkind IN ('r','p') AND n.nspname<>'evo'),
  'I5_grants_authenticated_select_evo', (
    SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='evo' AND grantee='authenticated' AND privilege_type='SELECT'),
  'I8_fns_pgnet_provider_fora_gateway', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','evo','ops','public')
      AND p.prosrc ~ 'net\.http_' AND p.prosrc ~* '(fn_evo_url|evolution)'
      AND p.proname NOT IN ('fn_evo_url','fn_evo_key')),
  'aux_triggers_zapp_com_fn_evo', (
    SELECT count(*) FROM pg_trigger tg
    JOIN pg_class tc ON tc.oid=tg.tgrelid JOIN pg_namespace tn ON tn.oid=tc.relnamespace
    JOIN pg_proc fp ON fp.oid=tg.tgfoid JOIN pg_namespace fn ON fn.oid=fp.pronamespace
    WHERE NOT tg.tgisinternal AND tn.nspname='zapp' AND fn.nspname='evo'),
  'aux_cron_citando_evo', (SELECT count(*) FROM cron.job WHERE command ~ 'evo\.'),
  'aux_cron_citando_zapp_evolution_tables', (
    SELECT count(*) FROM cron.job WHERE command ~ 'zapp\.evolution_(messages|contacts|conversations)'),
  'aux_phys_refs_fns_zapp_evolution', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prosrc ~ 'zapp\.evolution_(messages|contacts|conversations)'),
  'aux_searchpath_evo_com_zapp', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='evo' AND array_to_string(p.proconfig,',') ~ 'search_path=[^;]*zapp'),
  'aux_roles_contrato_existem', (
    SELECT count(*) FROM pg_roles WHERE rolname IN ('evo_writer','zapp_writer'))
);
$$;

REVOKE ALL ON FUNCTION ops.fn_boundary_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.fn_boundary_audit() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION ops.fn_boundary_audit() TO service_role;
