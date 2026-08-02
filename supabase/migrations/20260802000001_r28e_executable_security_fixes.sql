BEGIN;

-- ============================================================
-- R28e: Executable security fixes (CI/fresh-env parity)
-- Date: 2026-08-02
-- Resolves: 4 documentation-only migrations that had no executable SQL
--   - 20260801190000_r27b_reconcile_health_status_fix.sql   (Fix A)
--   - 20260801194500_r27_audit_gap_fix_rt32.sql             (RT32)
--   - 20260801185500_r27_security_workspace_isolation_rt28_31.sql (FIX 2, FIX 3)
--   - 20260801200000_r27_deep_audit_p0_gaps_rt33.sql        (P0-1, P0-2, P0-3)
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- FIX A: fn_reconcile_apply — 'disconnected' maps to 'error', not 'down'
-- Reason: 'error' is semantically correct for a disconnected connection;
--   'down' was added to the constraint as an emergency fix (20260801184500)
--   but the source function should use 'error' for production consistency.
--   The constraint accepts both values so this is safe to apply anywhere.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_apply()
 RETURNS TABLE(request_id bigint, instance_name text, action text, old_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo'
AS $function$
DECLARE
  v_job record; v_content text; v_body jsonb; v_http int; v_inst jsonb;
  v_db_status text; v_evo_raw text; v_evo_status text; v_phone text; v_owner text;
  v_evo_id text; v_action text; v_results jsonb := '[]'::jsonb;
  v_matched_name text;
  v_db_disconnected_at timestamptz;
  v_debounced boolean;
  v_best_status_per_phone JSONB := '{}'::jsonb;
  v_priority int; v_best_priority int;
BEGIN
  PERFORM set_config('app.reconcile_source','cron_reconcile', true);
  FOR v_job IN
    SELECT j.id, j.request_id FROM evo.evolution_reconcile_jobs j
    WHERE j.applied_at IS NULL AND j.dispatched_at < now()-interval '2 seconds'
    ORDER BY j.dispatched_at LIMIT 50
  LOOP
    SELECT r.status_code, r.content INTO v_http, v_content FROM net._http_response r WHERE r.id=v_job.request_id;
    IF v_http IS NULL THEN CONTINUE; END IF;
    IF v_http<>200 OR v_content IS NULL OR left(ltrim(v_content),1)<>'[' THEN
      UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http,
        result=jsonb_build_object('error','http_or_body_invalid','http',v_http,'body_sample',left(coalesce(v_content,'<null>'),120))
      WHERE id=v_job.id; CONTINUE;
    END IF;
    BEGIN v_body:=v_content::jsonb;
    EXCEPTION WHEN others THEN
      UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http,
        result=jsonb_build_object('error','json_parse_failed','http',v_http,'body_sample',left(v_content,120))
      WHERE id=v_job.id; CONTINUE;
    END;
    IF jsonb_typeof(v_body)<>'array' THEN
      UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http,
        result=jsonb_build_object('error','body_not_array','http',v_http)
      WHERE id=v_job.id; CONTINUE;
    END IF;

    v_best_status_per_phone := '{}'::jsonb;

    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_body) LOOP
      v_evo_raw   := v_inst->>'connectionStatus';
      v_owner     := v_inst->>'ownerJid';
      v_phone     := split_part(COALESCE(v_owner,''),'@',1);
      v_evo_status := CASE v_evo_raw WHEN 'open' THEN 'connected' WHEN 'connecting' THEN 'connecting' WHEN 'close' THEN 'disconnected' ELSE 'disconnected' END;
      v_priority   := CASE v_evo_status WHEN 'connected' THEN 4 WHEN 'connecting' THEN 3 WHEN 'disconnected' THEN 2 ELSE 1 END;

      IF v_phone IS NOT NULL AND v_phone!='' THEN
        v_best_priority := COALESCE((v_best_status_per_phone->>v_phone)::int, 0);
        IF v_priority > v_best_priority THEN
          v_best_status_per_phone := jsonb_set(v_best_status_per_phone, ARRAY[v_phone], to_jsonb(v_priority));
        END IF;
      END IF;
    END LOOP;

    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_body) LOOP
      v_evo_raw    := v_inst->>'connectionStatus';
      v_owner      := v_inst->>'ownerJid';
      v_evo_id     := v_inst->>'id';
      v_phone      := split_part(COALESCE(v_owner,''),'@',1);
      v_evo_status := CASE v_evo_raw WHEN 'open' THEN 'connected' WHEN 'connecting' THEN 'connecting' WHEN 'close' THEN 'disconnected' ELSE 'disconnected' END;
      v_priority   := CASE v_evo_status WHEN 'connected' THEN 4 WHEN 'connecting' THEN 3 WHEN 'disconnected' THEN 2 ELSE 1 END;

      SELECT wc.instance_name, wc.status, wc.disconnected_at INTO v_matched_name, v_db_status, v_db_disconnected_at
      FROM public.whatsapp_connections wc WHERE wc.instance_name=(v_inst->>'name');

      IF NOT FOUND AND v_phone IS NOT NULL AND v_phone!='' THEN
        SELECT wc.instance_name, wc.status, wc.disconnected_at INTO v_matched_name, v_db_status, v_db_disconnected_at
        FROM public.whatsapp_connections wc
        WHERE wc.phone_number=v_phone AND wc.is_active=true LIMIT 1;
      END IF;

      v_debounced := false;
      IF v_matched_name IS NOT NULL AND v_evo_status = 'connected'
         AND v_db_disconnected_at IS NOT NULL
         AND v_db_disconnected_at > now() - interval '10 minutes' THEN
        v_evo_status := 'connecting';
        v_priority := 3;
        v_debounced := true;
      END IF;

      IF v_matched_name IS NULL THEN
        v_action := 'skip_not_in_db';
      ELSE
        v_best_priority := COALESCE((v_best_status_per_phone->>v_phone)::int, 0);
        IF v_priority < v_best_priority THEN
          v_action := 'skip_lower_priority';
        ELSIF v_db_status IS DISTINCT FROM v_evo_status THEN
          UPDATE public.whatsapp_connections wc SET
            status=v_evo_status,
            instance_id=v_evo_id,
            phone_number=COALESCE(NULLIF(v_phone,''), wc.phone_number),
            owner_jid=COALESCE(v_owner, wc.owner_jid),
            health_status=CASE v_evo_status
              WHEN 'connected'    THEN 'ok'
              WHEN 'connecting'   THEN 'degraded'
              WHEN 'disconnected' THEN 'error'
              ELSE 'unknown'
            END,
            health_reason=CASE
              WHEN v_debounced THEN format('reconcile: evo_state=%s debounced (disconnected_at=%s < 10min ago)', v_evo_raw, v_db_disconnected_at)
              WHEN v_evo_status='connected' THEN NULL
              ELSE format('reconcile: evo_state=%s (evo_name=%s)', v_evo_raw, v_inst->>'name')
            END,
            last_health_check=now(),
            last_connected_at=CASE WHEN v_evo_status='connected' THEN now() ELSE wc.last_connected_at END,
            updated_at=now()
          WHERE wc.instance_name=v_matched_name;
          v_action := CASE WHEN v_matched_name!=(v_inst->>'name') THEN 'updated_via_phone_match' ELSE 'updated' END;
        ELSE
          UPDATE public.whatsapp_connections wc SET last_health_check=now(), instance_id=v_evo_id
          WHERE wc.instance_name=v_matched_name;
          v_action := 'no_change';
        END IF;
      END IF;

      v_results := v_results || jsonb_build_object('instance',COALESCE(v_matched_name,v_inst->>'name'),'evo_name',v_inst->>'name','action',v_action,'old',v_db_status,'new',v_evo_status,'debounced',v_debounced);
      request_id := v_job.request_id; instance_name := COALESCE(v_matched_name,v_inst->>'name'); action := v_action; old_status := v_db_status; new_status := v_evo_status;
      RETURN NEXT;
      v_matched_name := NULL; v_db_status := NULL; v_db_disconnected_at := NULL;
    END LOOP;

    UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http, result=v_results WHERE id=v_job.id;
    v_results := '[]'::jsonb;
  END LOOP;
  RETURN;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────
-- P0-1: vendas.fn_listar_bling_tokens — OAuth credential exposure
-- SECURITY DEFINER function that returned raw access_token for ALL Bling
-- accounts to any authenticated user. Revoke from authenticated + PUBLIC.
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION vendas.fn_listar_bling_tokens() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION vendas.fn_listar_bling_tokens() FROM authenticated;
  RAISE NOTICE 'R28e P0-1: REVOKE vendas.fn_listar_bling_tokens OK';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'R28e P0-1: vendas.fn_listar_bling_tokens() not found — skip';
  WHEN invalid_schema_name THEN RAISE NOTICE 'R28e P0-1: vendas schema not found — skip';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- P0-2: financeiro.apagar_nota_fiscal — DELETE without auth guard
-- SECURITY DEFINER function bypassed RLS; any authenticated user could
-- DELETE any nota fiscal by UUID.
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION financeiro.apagar_nota_fiscal(uuid) FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION financeiro.apagar_nota_fiscal(uuid) FROM authenticated;
  RAISE NOTICE 'R28e P0-2: REVOKE financeiro.apagar_nota_fiscal(uuid) OK';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'R28e P0-2: financeiro.apagar_nota_fiscal(uuid) not found — skip';
  WHEN invalid_schema_name THEN RAISE NOTICE 'R28e P0-2: financeiro schema not found — skip';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- P0-3: vendas.resetar_envios_pedido — DELETE + UPDATE without guard
-- SECURITY DEFINER function bypassed RLS; any authenticated user could
-- reset delivery records for any order.
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION vendas.resetar_envios_pedido(text) FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION vendas.resetar_envios_pedido(text) FROM authenticated;
  RAISE NOTICE 'R28e P0-3: REVOKE vendas.resetar_envios_pedido(text) OK';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'R28e P0-3: vendas.resetar_envios_pedido(text) not found — skip';
  WHEN invalid_schema_name THEN RAISE NOTICE 'R28e P0-3: vendas schema not found — skip';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- RT32: zapp.get_contact_intelligence_by_phone — any authenticated user
-- could call this SECURITY DEFINER function and read intelligence data.
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION zapp.get_contact_intelligence_by_phone(text) FROM authenticated;
  RAISE NOTICE 'R28e RT32: REVOKE zapp.get_contact_intelligence_by_phone(text) FROM authenticated OK';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'R28e RT32: zapp.get_contact_intelligence_by_phone(text) not found — skip';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- FIX 2: public.purge_old_query_telemetry — authenticated users
-- could trigger mass DELETE of telemetry data (no admin guard).
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.purge_old_query_telemetry(integer) FROM authenticated;
  RAISE NOTICE 'R28e FIX2: REVOKE public.purge_old_query_telemetry(integer) FROM authenticated OK';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'R28e FIX2: public.purge_old_query_telemetry(integer) not found — skip';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- FIX 3: vendas schema sequences — anon USAGE revoke
-- anon role should not be able to call nextval() on vendas sequences
-- (allows probing sequence state without authentication).
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'vendas') THEN
    REVOKE USAGE ON ALL SEQUENCES IN SCHEMA vendas FROM anon;
    RAISE NOTICE 'R28e FIX3: REVOKE anon USAGE ON ALL SEQUENCES IN SCHEMA vendas OK';
  ELSE
    RAISE NOTICE 'R28e FIX3: vendas schema not found — skip';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src text;
  v_has_down boolean;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'fn_reconcile_apply'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE WARNING 'R28e: fn_reconcile_apply not found in public schema (CI environment?)';
    RETURN;
  END IF;

  -- Check that 'down' is NOT used as the disconnected mapping
  v_has_down := (v_src LIKE '%WHEN ''disconnected'' THEN ''down''%');
  IF v_has_down THEN
    RAISE EXCEPTION 'R28e VERIFICATION FAILED: fn_reconcile_apply still maps disconnected->down';
  END IF;

  RAISE NOTICE 'R28e FIX A: fn_reconcile_apply maps disconnected->error (not down) ✓';
END $$;

COMMIT;
