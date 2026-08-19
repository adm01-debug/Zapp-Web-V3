-- lint:ok: NO-OP idempotente alinhando repo com banco canonico
-- ==========================================================================
-- Guards em RPCs de leitura/escrita (P0: 20 RPCs com fn_require_app_user)
-- Espelho versionado da onda de correção executada em 2026-08-07 (DB-as-source:
-- objetos JÁ aplicados em produção via psql; esta migration é NO-OP idempotente
-- que alinha o repo com o banco canônico).
-- Fonte: .hermes/audit-db-exaustiva/20260807/ (exec-01..14, fix_*.sql)
-- ==========================================================================

-- FIX ORQUESTRADOR pós-onda (2026-08-07): 5 RPCs sql sem guarda -> plpgsql com PERFORM guard
-- + policies cron.* para supabase_read_only_user (regressão CORR-11)

CREATE OR REPLACE FUNCTION zapp.get_avatars_by_jids_batch(p_jids text[])
 RETURNS TABLE(remote_jid text, avatar_url text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
  SELECT remote_jid, COALESCE(profile_picture_url,'')::text FROM evolution_contacts WHERE remote_jid=ANY(p_jids);
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.get_companies_by_phones_batch(p_phones text[])
 RETURNS TABLE(phone text, company text, full_name text, lead_status text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
SELECT ct.phone_number::text, ct.company::text, COALESCE(ct.full_name, ct.push_name)::text, ct.lead_status::text
FROM evo.evolution_contacts ct
WHERE ct.deleted_at IS NULL
  AND regexp_replace(COALESCE(ct.phone_number, ''), '\\D', '', 'g') = ANY (
    SELECT DISTINCT regexp_replace(COALESCE(p, ''), '\\D', '', 'g')
    FROM unnest(COALESCE(p_phones, '{}')) p
    WHERE length(regexp_replace(COALESCE(p, ''), '\\D', '', 'g')) >= 8
  )
LIMIT 1000;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.get_team_profiles()
 RETURNS SETOF zapp.profiles
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY SELECT * FROM profiles;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.rpc_get_contact_summary_batch(p_contact_ids uuid[])
 RETURNS TABLE(contact_id uuid, unread_whispers integer, pending_tasks integer)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
WITH unread_w AS (
  SELECT contact_id, COUNT(*)::int AS cnt
  FROM zapp.whisper_messages
  WHERE contact_id = ANY(p_contact_ids) AND is_read = false
  GROUP BY contact_id
), pending_t AS (
  SELECT contact_id, COUNT(*)::int AS cnt
  FROM zapp.conversation_tasks
  WHERE contact_id = ANY(p_contact_ids) AND status = 'pending'
  GROUP BY contact_id
)
SELECT ids.id AS contact_id, COALESCE(uw.cnt, 0) AS unread_whispers, COALESCE(pt.cnt, 0) AS pending_tasks
FROM unnest(p_contact_ids) AS ids(id)
LEFT JOIN unread_w uw ON uw.contact_id = ids.id
LEFT JOIN pending_t pt ON pt.contact_id = ids.id;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.search_contacts_advanced(p_search text DEFAULT NULL::text, p_vendedor text DEFAULT NULL::text, p_ramo text DEFAULT NULL::text, p_rfm_segment text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_cliente_ativado boolean DEFAULT NULL::boolean, p_ja_comprou boolean DEFAULT NULL::boolean, p_sort_by text DEFAULT 'last_message_at'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS TABLE(id uuid, remote_jid text, full_name text, push_name text, phone_number text, email text, company text, lead_status text, assigned_to text, tags text[], total_purchases integer, last_message_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
SELECT ct.id, ct.remote_jid::text, ct.full_name::text, ct.push_name::text, ct.phone_number::text, ct.email::text, ct.company::text, ct.lead_status::text, ct.assigned_to::text, ct.tags, ct.total_purchases::int, ct.last_message_at, count(*) OVER() AS total_count
FROM evo.evolution_contacts ct
WHERE ct.deleted_at IS NULL AND (p_search IS NULL OR ct.full_name ILIKE '%'||p_search||'%' OR ct.push_name ILIKE '%'||p_search||'%' OR ct.phone_number ILIKE '%'||p_search||'%' OR ct.company ILIKE '%'||p_search||'%') AND (p_vendedor IS NULL OR ct.assigned_to = p_vendedor) AND (p_ramo IS NULL OR ct.company ILIKE '%'||p_ramo||'%') AND (p_rfm_segment IS NULL OR ct.lead_status = p_rfm_segment) AND (p_cliente_ativado IS NULL OR (ct.lead_status='cliente') = p_cliente_ativado) AND (p_ja_comprou IS NULL OR (coalesce(ct.total_purchases,0)>0) = p_ja_comprou)
ORDER BY CASE WHEN p_sort_by='full_name' THEN ct.full_name END ASC NULLS LAST, CASE WHEN p_sort_by='created_at' THEN ct.created_at END DESC NULLS LAST, ct.last_message_at DESC NULLS LAST
LIMIT greatest(p_page_size,1) OFFSET greatest(p_page-1,0)*greatest(p_page_size,1);
END;
$function$;


-- CORR-11 follow-up: restaurar leitura de cron.* para supabase_read_only_user (RLS username=CURRENT_USER)
DROP POLICY IF EXISTS ro_cron_job_readonly ON cron.job;
CREATE POLICY ro_cron_job_readonly ON cron.job FOR SELECT TO supabase_read_only_user USING (true);
DROP POLICY IF EXISTS ro_cron_run_readonly ON cron.job_run_details;
CREATE POLICY ro_cron_run_readonly ON cron.job_run_details FOR SELECT TO supabase_read_only_user USING (true);

-- VERIFICAÇÃO
SELECT p.proname, l.lanname, (p.prosrc ILIKE '%fn_require_app_user%') AS tem_guard FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='zapp' AND p.proname IN ('get_avatars_by_jids_batch','get_companies_by_phones_batch','get_team_profiles','rpc_get_contact_summary_batch','search_contacts_advanced') ORDER BY 1;
SELECT policyname, tablename, roles::text FROM pg_policies WHERE schemaname='cron' AND policyname LIKE 'ro_%';

-- FIX ORQUESTRADOR (final): guardas nas 2 últimas RPCs sem proteção interna
-- 1) get_duplicate_report: PII (nomes+telefones duplicados) -> membership guard
CREATE OR REPLACE FUNCTION zapp.get_duplicate_report(p_instance_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN (
    WITH grupos AS (SELECT regexp_replace(coalesce(phone_number,''),'\D','','g') AS pn, count(*) AS qtd, array_agg(coalesce(full_name,push_name,phone_number)::text) AS nomes FROM evo.evolution_contacts WHERE deleted_at IS NULL AND instance_name=p_instance_name AND length(regexp_replace(coalesce(phone_number,''),'\D','','g'))>=10 GROUP BY 1 HAVING count(*)>1)
    SELECT jsonb_build_object('instance', p_instance_name, 'grupos_duplicados', (SELECT count(*) FROM grupos), 'contatos_em_duplicidade', coalesce((SELECT sum(qtd) FROM grupos),0), 'excedentes_a_mesclar', coalesce((SELECT sum(qtd-1) FROM grupos),0), 'amostra_top5', coalesce((SELECT jsonb_agg(jsonb_build_object('phone',pn,'qtd',qtd,'nomes',nomes)) FROM (SELECT * FROM grupos ORDER BY qtd DESC LIMIT 5) t), '[]'::jsonb))
  );
END;
$function$;

-- 2) rpc_migrate_whatsapp_integration: escrita (migração de provider) -> admin-only
CREATE OR REPLACE FUNCTION zapp.rpc_migrate_whatsapp_integration()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_evo_count INT := 0;
  v_evo_open  INT := 0;
  v_evo_default RECORD;
  v_cloud_phone TEXT;
  v_cloud_waba  TEXT;
  v_current_mode TEXT;
  v_chosen_provider TEXT;
  v_status TEXT;
  v_notes TEXT;
  v_signals JSONB;
  v_profile_id UUID;
  v_default_instance TEXT;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden: admin required' USING ERRCODE = '42501';
  END IF;
  -- Sinais Evolution: instâncias registradas localmente
  SELECT COUNT(*) INTO v_evo_count FROM zapp.whatsapp_connections;
  SELECT COUNT(*) INTO v_evo_open
    FROM zapp.whatsapp_connections
    WHERE COALESCE(status,'') IN ('open','connected');
  SELECT instance_id, name, phone_number, status
    INTO v_evo_default
    FROM zapp.whatsapp_connections
    WHERE is_default = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  -- Sinais Cloud: settings já preenchidos
  SELECT value INTO v_cloud_phone FROM zapp.global_settings WHERE key = 'whatsapp_cloud_display_phone';
  SELECT value INTO v_cloud_waba  FROM zapp.global_settings WHERE key = 'whatsapp_cloud_waba_name';

  SELECT value INTO v_current_mode FROM zapp.global_settings WHERE key = 'whatsapp_mode';

  v_signals := jsonb_build_object(
    'evolution_instances_total', v_evo_count,
    'evolution_instances_open',  v_evo_open,
    'evolution_default_instance', COALESCE(v_evo_default.instance_id, NULL),
    'cloud_display_phone_set',   COALESCE(NULLIF(v_cloud_phone,''), NULL) IS NOT NULL,
    'cloud_waba_name_set',       COALESCE(NULLIF(v_cloud_waba,''),  NULL) IS NOT NULL,
    'previous_mode',             COALESCE(v_current_mode, 'unset')
  );

  IF v_evo_open > 0 OR v_evo_count > 0 THEN
    v_chosen_provider := 'evolution';
  ELSIF COALESCE(NULLIF(v_cloud_phone,''),'') <> '' THEN
    v_chosen_provider := 'cloud';
  ELSE
    v_chosen_provider := CASE WHEN v_current_mode = 'official' THEN 'cloud' ELSE 'evolution' END;
  END IF;

  v_default_instance := COALESCE(v_evo_default.instance_id, 'wpp2');

  INSERT INTO zapp.global_settings(key, value)
  VALUES ('whatsapp_mode', CASE WHEN v_chosen_provider = 'cloud' THEN 'official' ELSE 'unofficial' END)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now()
    WHERE zapp.global_settings.value IS DISTINCT FROM EXCLUDED.value;

  IF v_chosen_provider = 'cloud' AND COALESCE(NULLIF(v_cloud_phone,''),'') = '' THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo oficial selecionado, mas faltam credenciais Meta (phone/WABA).';
  ELSIF v_chosen_provider = 'evolution' AND v_evo_count = 0 THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo Evolution selecionado, mas nenhuma instância registrada.';
  ELSE
    v_status := 'migrated';
    v_notes  := format('Provider %s ativado a partir dos sinais existentes.', v_chosen_provider);
  END IF;

  UPDATE zapp.integration_profiles SET is_active = false WHERE is_active = true;

  SELECT id INTO v_profile_id
    FROM zapp.integration_profiles
    WHERE provider = v_chosen_provider
    ORDER BY updated_at DESC LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO zapp.integration_profiles
      (provider, is_active, default_instance, display_phone, waba_name,
       detected_signals, migration_status, migration_notes, migrated_at)
    VALUES
      (v_chosen_provider, true,
       CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE NULL END,
       NULLIF(v_cloud_phone,''), NULLIF(v_cloud_waba,''),
       v_signals, v_status, v_notes,
       CASE WHEN v_status = 'migrated' THEN now() ELSE NULL END)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE zapp.integration_profiles
       SET is_active = true,
           default_instance = CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE default_instance END,
           display_phone = COALESCE(NULLIF(v_cloud_phone,''), display_phone),
           waba_name     = COALESCE(NULLIF(v_cloud_waba,''),  waba_name),
           detected_signals = v_signals,
           migration_status = v_status,
           migration_notes  = v_notes,
           migrated_at = CASE WHEN v_status = 'migrated' THEN now() ELSE migrated_at END
     WHERE id = v_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'provider',   v_chosen_provider,
    'mode',       CASE WHEN v_chosen_provider='cloud' THEN 'official' ELSE 'unofficial' END,
    'status',     v_status,
    'notes',      v_notes,
    'signals',    v_signals
  );
END;
$function$;

-- Verificação
SELECT p.proname, (p.prosrc LIKE '%fn_require_app_user%' OR p.prosrc LIKE '%is_admin_or_supervisor%') AS tem_guard
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='zapp' AND p.proname IN ('get_duplicate_report','rpc_migrate_whatsapp_integration') ORDER BY 1;

-- VAL-01 s04b: guarda em fn_count_total_rows (defense-in-depth; EXECUTE já restrito a postgres/service_role)
CREATE OR REPLACE FUNCTION zapp.fn_count_total_rows(p_schema text, p_table text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_count bigint;
BEGIN
  PERFORM zapp.fn_require_app_user();
  EXECUTE format('SELECT COUNT(*) FROM %I.%I', p_schema, p_table) INTO v_count;
  RETURN v_count;
END;
$function$;

-- VAL-02-20: drop da public._wal_slot_guard_events recriada pelo produtor (agora v13 escreve em ops)
DROP TABLE IF EXISTS public._wal_slot_guard_events;

-- Verificação
SELECT p.proname, (p.prosrc LIKE '%fn_require_app_user%') AS tem_guard
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='zapp' AND p.proname='fn_count_total_rows';
SELECT to_regclass('public._wal_slot_guard_events') AS public_tabela, to_regclass('ops._wal_slot_guard_events') AS ops_tabela;
SELECT count(*) FROM ops._ck_viol_audit UNION ALL SELECT count(*) FROM ops._fk_orphan_audit UNION ALL SELECT count(*) FROM ops._msg_shard_orphan_audit UNION ALL SELECT count(*) FROM ops._wal_slot_guard_events;

