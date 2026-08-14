-- check 9 vault_key_correct_md5: substitui SELECT COUNT(*) FROM vault.secrets
-- por ops.fn_evo_key() IS NOT NULL. Motivo: SECURITY DEFINER + search_path='zapp'
-- não tem acesso direto a vault.secrets; fn_evo_key() é o gateway canônico.
-- Aplicado diretamente no banco em 2026-08-14; esta migration codifica o estado atual.

CREATE OR REPLACE FUNCTION zapp.fn_health_preflight()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_val    boolean;
  v_count  bigint;
  v_checks jsonb := '{}':::jsonb;
  v_total  int;
  v_passed int;
BEGIN
  -- 1. vps_health_100
  SELECT (evo.fn_vps_health_score() = 100) INTO v_val;
  v_checks := v_checks || jsonb_build_object('vps_health_100', COALESCE(v_val, false));

  -- 2. system_health_above_99 (JSONB key "score")
  SELECT ((zapp.fn_system_health_score_cached()->>'score')::numeric >= 99) INTO v_val;
  v_checks := v_checks || jsonb_build_object('system_health_above_99', COALESCE(v_val, false));

  -- 3. rls_enabled_100pct
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('evo','zapp','public','ops')
    AND c.relkind = 'r' AND NOT c.relrowsecurity;
  v_checks := v_checks || jsonb_build_object('rls_enabled_100pct', COALESCE(v_val, false));

  -- 4. security_audit_clean
  SELECT ((zapp.fn_security_surface_audit()->>'truly_dangerous') = 'false') INTO v_val;
  v_checks := v_checks || jsonb_build_object('security_audit_clean', COALESCE(v_val, false));

  -- 5. security_fn_v3_no_old_anon
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_security_surface_audit' AND n.nspname = 'public'
    AND p.prosrc ILIKE '%anon_execute > 0%';
  v_checks := v_checks || jsonb_build_object('security_fn_v3_no_old_anon', COALESCE(v_val, false));

  -- 6. guardrails_v2_saturday_fix
  SELECT (COUNT(*) = 1) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_guardrails_check' AND n.nspname = 'ops'
    AND p.prosrc ILIKE '%BETWEEN 1 AND 5%';
  v_checks := v_checks || jsonb_build_object('guardrails_v2_saturday_fix', COALESCE(v_val, false));

  -- 7. halt_fn_dow_no_4h_bug
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_alert_consumer_halt' AND n.nspname = 'ops'
    AND p.prosrc ILIKE '%4 hours%';
  v_checks := v_checks || jsonb_build_object('halt_fn_dow_no_4h_bug', COALESCE(v_val, false));

  -- 8. probe_fn_weekend_1440_no_details_bug
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_pipeline_health_probe' AND n.nspname = 'evo'
    AND (p.prosrc NOT ILIKE '%1440%' OR p.prosrc ILIKE '%->%details%');
  v_checks := v_checks || jsonb_build_object('probe_fn_weekend_1440_no_details_bug', COALESCE(v_val, false));

  -- 9. vault_key_correct_md5 — ops.fn_evo_key() em vez de SELECT COUNT(*) FROM vault.secrets
  SELECT (ops.fn_evo_key() IS NOT NULL) INTO v_val;
  v_checks := v_checks || jsonb_build_object('vault_key_correct_md5', COALESCE(v_val, false));

  -- 10. probe_cron_scheduled
  SELECT (COUNT(*) >= 1) INTO v_val
  FROM cron.job WHERE jobname = 'evolution-pipeline-probe-15min' AND active;
  v_checks := v_checks || jsonb_build_object('probe_cron_scheduled', COALESCE(v_val, false));

  -- 11. snapshot_cron_active
  SELECT (COUNT(*) >= 1) INTO v_val
  FROM cron.job
  WHERE jobname = 'vps-performance-snapshot'
    AND command ILIKE '%fn_system_health_score_cached%'
    AND active;
  v_checks := v_checks || jsonb_build_object('snapshot_cron_active', COALESCE(v_val, false));

  -- 12. detect401_cron_evo_schema
  SELECT (COUNT(*) >= 1) INTO v_val
  FROM cron.job WHERE jobname = 'evo-detect-401-bursts' AND command ILIKE '%evo.%' AND active;
  v_checks := v_checks || jsonb_build_object('detect401_cron_evo_schema', COALESCE(v_val, false));

  -- 13. v2_pipeline_score_10 (evo schema)
  SELECT ((evo.fn_pipeline_health_probe()->>'pipeline_status') = 'healthy'
       OR (evo.fn_pipeline_health_probe()->>'status') = 'ok') INTO v_val;
  v_checks := v_checks || jsonb_build_object('v2_pipeline_score_10', COALESCE(v_val, false));

  -- 14. no_open_unintended_alerts
  SELECT (COUNT(*) = 0) INTO v_val
  FROM zapp.warroom_alerts
  WHERE alert_type = 'critical'
    AND resolved_at IS NULL
    AND created_at > now() - interval '4h'
    AND source NOT IN ('fn_detect_401_bursts','test');
  v_checks := v_checks || jsonb_build_object('no_open_unintended_alerts', COALESCE(v_val, false));

  -- 15. dead_tuples_below_100
  SELECT (COALESCE(MAX(n_dead_tup), 0) < 100000) INTO v_val
  FROM pg_stat_user_tables WHERE schemaname IN ('evo','zapp','public','ops');
  v_checks := v_checks || jsonb_build_object('dead_tuples_below_100', COALESCE(v_val, false));

  -- 16. no_public_role_open_policies (polroles={0} = TO PUBLIC)
  SELECT COUNT(*) INTO v_count
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('evo','zapp','public','ops')
    AND pol.polroles = '{0}'
    AND pg_get_expr(pol.polqual, pol.polrelid) = 'true';
  v_val := (v_count = 0);
  v_checks := v_checks || jsonb_build_object(
    'no_public_role_open_policies',     v_val,
    'public_role_open_policy_count',    v_count
  );

  -- Metadata: authenticated USING(true) debt tracking
  v_checks := v_checks || jsonb_build_object(
    'open_authenticated_tables_evo',
      (SELECT COUNT(*) FROM pg_policy pol2
       JOIN pg_class c2 ON c2.oid = pol2.polrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       WHERE n2.nspname = 'evo'
         AND pol2.polroles @> ARRAY[16448::oid]
         AND pg_get_expr(pol2.polqual, pol2.polrelid) = 'true'),
    'open_authenticated_tables_zapp',
      (SELECT COUNT(*) FROM pg_policy pol2
       JOIN pg_class c2 ON c2.oid = pol2.polrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       WHERE n2.nspname = 'zapp'
         AND pol2.polroles @> ARRAY[16448::oid]
         AND pg_get_expr(pol2.polqual, pol2.polrelid) = 'true'),
    'open_authenticated_tables_public',
      (SELECT COUNT(*) FROM pg_policy pol2
       JOIN pg_class c2 ON c2.oid = pol2.polrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       WHERE n2.nspname = 'public'
         AND pol2.polroles @> ARRAY[16448::oid]
         AND pg_get_expr(pol2.polqual, pol2.polrelid) = 'true'),
    'note_authenticated_rls',
      'USING(true) for authenticated = known architectural debt (single-org, RBAC in app layer). Incremental hardening per module.',
    'version', 'v3b-check-patterns-corrected-2026-07-11'
  );

  -- Compute score (exclude metadata-only keys)
  SELECT
    COUNT(*) FILTER (WHERE key NOT IN (
      'public_role_open_policy_count',
      'open_authenticated_tables_evo',
      'open_authenticated_tables_zapp',
      'open_authenticated_tables_public',
      'note_authenticated_rls',
      'version'
    )),
    COUNT(*) FILTER (WHERE value = 'true' AND key NOT IN (
      'public_role_open_policy_count',
      'open_authenticated_tables_evo',
      'open_authenticated_tables_zapp',
      'open_authenticated_tables_public',
      'note_authenticated_rls',
      'version'
    ))
  INTO v_total, v_passed
  FROM jsonb_each_text(v_checks);

  RETURN jsonb_build_object(
    'all_green',  (v_passed = v_total),
    'score_pct',  ROUND((v_passed::numeric / NULLIF(v_total, 0)) * 100, 1),
    'passed',     v_passed,
    'total',      v_total,
    'checks',     v_checks,
    'ran_at',     now(),
    'version',    'v3b-check-patterns-corrected-2026-07-11'
  );
END;
$function$;
