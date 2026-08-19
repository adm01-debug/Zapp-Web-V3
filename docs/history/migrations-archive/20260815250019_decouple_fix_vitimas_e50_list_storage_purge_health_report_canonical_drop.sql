-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250019), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE6_7_8_LOG.md ("Fix — 4 vitimas do E50"). O criterio
-- de "morta" do E50 (docs/decouple, ver 20260815250009_*.sql) checou crons e
-- codigo, mas NAO o prosrc de outras fns — 4 fns dropadas naquele lote tinham
-- chamadores vivos. Corpos: snapshot de producao 2026-08-15/16 via
-- pg_get_functiondef.
--
-- LACUNA: evo.fn_lid_upgrade_readiness_check e evo.fn_canonical_route_decision
-- foram dropadas no E50 com corpo perdido (git so tinha o COMMENT/nada) — nao
-- ha como recuperar o prosrc original. Os DROPs abaixo sao idempotentes/no-op
-- (os nomes ja nao existem em producao); ficam registrados por completude do
-- replay, resolvendo por nome (sem lista de argumentos) pois a assinatura
-- exata nao foi documentada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Vitima 1: fn_purge_storage_cache (zapp) chamava evo.fn_list_storage_cache_for_purge
-- (dropada no E50, corpo perdido). Como fn_purge_storage_cache tem
-- EXCEPTION WHEN OTHERS, o purge falharia silenciosamente (ok=false) toda
-- noite as 03:00, revertendo inclusive a fase A. SRF reconstruida: buckets
-- derivados do historico de media_cleanup_log (whatsapp-media, audio-messages,
-- zapp-whatsapp-media), created_at < now()-days, LIMIT 200/run conservador.
-- Smoke real (LOTE6_7_8_LOG.md): 200 candidatos; fn_purge_storage_cache(30) ok=true.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS evo.fn_lid_upgrade_readiness_check;

CREATE OR REPLACE FUNCTION evo.fn_list_storage_cache_for_purge(days integer DEFAULT 30)
 RETURNS TABLE(bucket_name text, storage_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
    SELECT o.bucket_id::text, o.name::text
    FROM storage.objects o
    WHERE o.bucket_id IN ('whatsapp-media','audio-messages','zapp-whatsapp-media')
      AND o.created_at < now() - make_interval(days => days)
    ORDER BY o.created_at
    LIMIT 200
  $function$;

-- ---------------------------------------------------------------------------
-- Vitima 2: evo.fn_lid_health_report ln37-38 chamava fn_lid_upgrade_readiness_check
-- (dropada no E50, corpo perdido) -> substituido por literais
-- 'check_removed_e50' / NULL no bloco "upgrade". Roda OK (LOTE6_7_8_LOG.md).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION evo.fn_lid_health_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'ops', 'pg_catalog'
AS $function$
DECLARE v_r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'report_at',       now(),
    'period',          '7 days',
    -- Estado do sistema
    'system', jsonb_build_object(
      'pipeline_status', ps.pipeline_status,
      'completeness',    ps.completeness_score,
      'open_alerts',     ps.open_alerts,
      'infra_score',     (SELECT zapp.fn_system_health_score()->>'score'),
      'wpp2_state',      (SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1)
    ),
    -- Estado LID
    'lid', jsonb_build_object(
      'health_score',          ls.lid_health_score,
      'status',                ls.lid_status,
      'fake_jids_historical',  ls.fake_jids_historical,
      'map_real_entries',      ls.map_real_entries,
      'lid_coverage_pct',      ls.lid_coverage_pct,
      'lid_contacts_wpp2',     ls.lid_contacts_wpp2,
      'contact_identity_pn',   ls.contact_identity_pn,
      'contact_identity_lid',  ls.contact_identity_lid,
      'contamination',         ls.contacts_lid_phone_contaminated,
      'trend',                 ls.fake_jid_trend
    ),
    -- Progresso das 50 etapas
    'steps', jsonb_build_object(
      'done',  sp.steps_done,
      'total', sp.steps_total,
      'pct',   round(100.0 * sp.steps_done / sp.steps_total, 1),
      'blocker', CASE WHEN sp.steps_done < 50 THEN 'Evolution API 2.4.x upgrade (etapas 24,25,27,28 + Fase 1)' ELSE 'COMPLETED' END
    ),
    -- Upgrade readiness
    'upgrade', jsonb_build_object(
      'status',             'check_removed_e50',
      'checks_ok',          NULL,
      'rollback_image',     'sha256:ed066617b536860837bb9a58deb66e5f9e31d0399c2b3c2209c933da9405e6b2',
      'version_index',      '13371912',
      'snapshots_ready',    3
    ),
    -- Testes de regressão
    'regression', jsonb_build_object(
      'suite_12', (evo.fn_lid_regression_suite()->> 'status'),
      'suite_10', (evo.fn_lid_normalizer_test_suite()->>'result'),
      'pending_post_upgrade', ARRAY['T13_real_lid_mappings','T14_ci_lid_populated','T15_lid_coverage_target']
    ),
    -- Crons LID
    'crons', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', (SELECT status FROM cron.job_run_details WHERE jobid=j.jobid ORDER BY runid DESC LIMIT 1)
      ))
      FROM cron.job j WHERE j.jobname ILIKE '%lid%'
    ),
    -- Índices críticos
    'indexes', jsonb_build_object(
      'trgm_gin', (SELECT pg_size_pretty(pg_relation_size('zapp.idx_ec_remote_jid_trgm'::regclass))),
      'lid_phone_map_pk', (SELECT pg_size_pretty(pg_relation_size('evo.lid_phone_map_pkey'::regclass))),
      'contact_identity_lid', (SELECT pg_size_pretty(pg_relation_size('evo.idx_contact_identity_lid'::regclass)))
    ),
    -- Métricas semanais
    'weekly', (SELECT row_to_json(m) FROM evo.v_lid_weekly_metrics m LIMIT 1)
  ) INTO v_r
  FROM evo.v_production_scorecard ps, evo.v_lid_health_scorecard ls, evo.v_50_steps_progress sp;
  RETURN v_r;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Vitima 3: evo.fn_canonical_route_check_daily chamava incondicionalmente
-- fn_canonical_route_decision (dropada no E50) — quebraria no cron diario
-- 08:00. Subsistema shadow/canonical descomissionado -> fn dropada + cron
-- 'canonical-route-decision-daily' unscheduled (0 chamadores).
--
-- Vitima 4 (fn_lid_upgrade_alert_check cita fn_prepare_lid_dedup apenas em
-- STRING de payload) e cosmetica — mantida sem alteracao, nao entra aqui.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS evo.fn_canonical_route_check_daily();
DROP FUNCTION IF EXISTS evo.fn_canonical_route_decision;

-- unschedule idempotente: job pode ja nao existir se o replay rodar fora de ordem
DO $$
BEGIN
  PERFORM cron.unschedule('canonical-route-decision-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Licao registrada no log de origem: criterio de morte de fn deve incluir
-- pg_proc.prosrc ~ nome, alem de cron/codigo (ver LOTE6_7_8_LOG.md).
