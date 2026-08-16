-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250010), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/BOUNDARY_AUDIT_V2.md ("E53/E85"). Corpos: pg_get_functiondef
-- em producao 2026-08-15 pos-Lote5.
-- ============================================================================

-- 1. ops.fn_boundary_audit v2 — allowlist da superficie declarada (I1/I2/I8)
CREATE OR REPLACE FUNCTION ops.fn_boundary_audit()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
SELECT jsonb_build_object(
  'measured_at', now(),
  'I1_fns_evo_citando_zapp', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='evo'
      AND regexp_replace(p.prosrc, 'zapp\.rpc_boundary_[a-z_]+', '', 'g') ~* '\mzapp\.'),
  'I2_fns_zapp_citando_evo', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='zapp'
      AND regexp_replace(p.prosrc, 'evo\.(rpc_boundary_[a-z_]+|rpc_(claim|complete|fail)_media_download(_batch)?|fn_mark_status_viewed|fn_touch_contact_presence|fn_upsert_group_(from_event|participants))', '', 'g') ~* '\mevo\.'),
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
      AND p.prosrc ~ 'net\.http_'
      AND p.prosrc ~* '(fn_evo_url|evolution\.atomicabr\.com\.br)'
      AND p.proname NOT IN ('fn_evo_url','fn_evo_key','fn_provider_call','fn_outbound_dispatch','fn_reconcile_dispatch')),
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
$function$;

-- 2. E53 — papeis de contrato (idempotente)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evo_writer') THEN
    CREATE ROLE evo_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zapp_writer') THEN
    CREATE ROLE zapp_writer NOLOGIN;
  END IF;
END $do$;

-- 3. E85 — porta SQL unica de egresso ao provider
CREATE OR REPLACE FUNCTION ops.fn_provider_call(p_method text, p_path text, p_body jsonb DEFAULT NULL::jsonb, p_timeout_ms integer DEFAULT 10000)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_url text := ops.fn_evo_url();
  v_key text := ops.fn_evo_key();
  v_req bigint;
BEGIN
  -- E85: porta SQL unica de egresso ao provider (P4). Toda chamada pg_net ao provider passa aqui.
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'provider_url_ausente (vault evolution_api_url)';
  END IF;
  IF upper(p_method) = 'GET' THEN
    v_req := net.http_get(url := v_url||p_path, headers := jsonb_build_object('apikey', coalesce(v_key,''), 'Content-Type','application/json'), params := '{}', timeout_milliseconds := p_timeout_ms);
  ELSIF upper(p_method) = 'POST' THEN
    v_req := net.http_post(url := v_url||p_path, body := coalesce(p_body,'{}'::jsonb), headers := jsonb_build_object('apikey', coalesce(v_key,''), 'Content-Type','application/json'), params := '{}', timeout_milliseconds := p_timeout_ms);
  ELSE
    RAISE EXCEPTION 'metodo_nao_suportado: %', p_method;
  END IF;
  RETURN v_req;
END $function$;

REVOKE ALL ON FUNCTION ops.fn_provider_call(text, text, jsonb, integer) FROM PUBLIC;

-- 4. Bypasses reescritos para a porta unica (diff minimo, declaracoes preservadas)
CREATE OR REPLACE FUNCTION evo.fn_sync_lid_from_api(p_instance text DEFAULT 'wpp2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_req_id bigint; BEGIN v_req_id := ops.fn_provider_call('GET', '/contact/findContacts/'||p_instance, NULL, 15000); RETURN jsonb_build_object('ok',true,'req_id',v_req_id,'instance',p_instance,'provider','evolution'); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM,'fn','fn_sync_lid_from_api'); END; $function$;

CREATE OR REPLACE FUNCTION evo.fn_sync_lid_from_api(p_instance text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_req_id bigint; BEGIN v_req_id := ops.fn_provider_call('GET', '/contact/findContacts/'||p_instance, NULL, 15000); RETURN jsonb_build_object('ok',true,'req_id',v_req_id,'instance',p_instance,'limit',p_limit,'provider','evolution'); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM,'fn','fn_sync_lid_from_api_2args'); END; $function$;

CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url(p_instance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$ DECLARE v_req_id bigint; BEGIN v_req_id := ops.fn_provider_call('GET', '/instance/connectionState/'||p_instance, NULL, 5000); RETURN jsonb_build_object('ok',true,'instance',p_instance,'req_id',v_req_id,'provider','evolution'); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM,'instance',p_instance); END; $function$;

CREATE OR REPLACE FUNCTION zapp.fn_check_license_heartbeat()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public'
AS $function$
DECLARE
  v_http_code int;
  v_body      text;
  v_status    text;
  v_falhas    int;
  v_req       bigint;
BEGIN
  v_req := ops.fn_provider_call('GET', '/license/status', NULL, 10000);
  PERFORM pg_sleep(7);

  SELECT status_code, content::text
  INTO v_http_code, v_body
  FROM net._http_response
  WHERE id = v_req;

  v_status := CASE
    WHEN v_http_code = 200 AND (v_body ~ '"ok"\s*:\s*true' OR v_body ~ '"status"\s*:\s*"active"') THEN 'active'
    WHEN v_http_code = 200 AND v_body !~ '"status"' AND v_body ~ '"ok"\s*:\s*true' THEN 'active'
    ELSE COALESCE(v_body, 'sem_resposta')
  END;

  INSERT INTO zapp.license_heartbeat_log (checked_at, status, http_code, raw)
  VALUES (now(), v_status, COALESCE(v_http_code, 0), left(COALESCE(v_body, ''), 500));

  IF v_status <> 'active' OR v_http_code IS DISTINCT FROM 200 THEN
    SELECT count(*) INTO v_falhas
    FROM zapp.license_heartbeat_log
    WHERE checked_at > now() - interval '1 hour' AND status <> 'active';

    IF v_falhas >= 3 THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload, created_at)
      SELECT 'license_heartbeat', 'critical', 'License Evolution INATIVA',
        'Heartbeat falhou ' || v_falhas || 'x/hora. HTTP=' ||
        COALESCE(v_http_code::text,'NULL') || ' status=' || left(COALESCE(v_status,'?'),100),
        jsonb_build_object('http_code',v_http_code,'status',v_status,'raw',left(COALESCE(v_body,''),500)), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM zapp.evolution_alerts ea2
        WHERE ea2.alert_type = 'license_heartbeat'
          AND ea2.resolved_at IS NULL AND ea2.created_at > now() - interval '2 hours'
      );
    END IF;
  END IF;

  RETURN v_status;
END;
$function$;

-- Nota: a validacao negativa/positiva de E54 (SET ROLE evo_writer/zapp_writer + INSERT/UPDATE
-- direto negados) so foi possivel apos as RPCs de contrato existirem (migration 20260815250012);
-- neste ponto (250010) so os papeis foram criados, sem grants ainda.
