-- decouple E86 + SEC-E89: egress log no dispatch + grants mínimos do wrapper stats
-- 2026-08-16 | DB-as-source: aplicado via MCP; este arquivo é o espelho versionado
-- | idempotente (CREATE OR REPLACE; REVOKE via DO block)

-- 1. E86: fn_outbound_dispatch passa a logar cada POST em ops.pgnet_egress_log
--    (falha de log NUNCA altera o dispatch — bloco EXCEPTION interno)
CREATE OR REPLACE FUNCTION zapp.fn_outbound_dispatch(p_batch_size integer DEFAULT 10)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
DECLARE v_api_url text; v_api_key text; v_row record; v_conn record; v_endpoint text;
        v_body jsonb; v_req_id bigint; v_sent int := 0; v_skipped int := 0; v_failed int := 0;
        v_number text; v_local text;
BEGIN
  v_api_url := ops.fn_evo_url(); v_api_key := ops.fn_evo_key();
  IF v_api_url IS NULL OR v_api_key IS NULL THEN
    RAISE EXCEPTION '[fn_outbound_dispatch] vault secrets faltando';
  END IF;
  FOR v_row IN SELECT q.* FROM zapp.outbound_message_queue q
    WHERE q.status = 'pending' AND coalesce(q.retry_count,0) < coalesce(q.max_retries,3)
    ORDER BY q.created_at ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED
  LOOP
    SELECT status INTO v_conn FROM zapp.whatsapp_connections
    WHERE instance_name = v_row.instance_name LIMIT 1;
    IF v_conn IS NULL OR v_conn.status <> 'connected' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    BEGIN
      v_local := split_part(v_row.remote_jid, '@', 1);
      IF length(v_local) >= 14 AND v_local ~ '^[0-9]{14,}$' THEN
        BEGIN
          v_number := split_part(zapp.fn_normalize_send_jid(v_row.remote_jid, v_row.instance_name),'@',1);
        EXCEPTION WHEN OTHERS THEN
          UPDATE zapp.outbound_message_queue SET status='failed',
            error_message='LID-as-phone sem mapeamento PN real: '||v_row.remote_jid||'. Aguarda Evolution >=2.4.x. [LID-FIX-01]',
            failed_at=now(), updated_at=now() WHERE id=v_row.id;
          v_failed := v_failed+1; CONTINUE;
        END;
      ELSE v_number := v_local; END IF;
      IF (v_row.message_type='text' OR v_row.message_type IS NULL) AND v_row.content IS NULL THEN
        RAISE EXCEPTION 'content nulo para mensagem de texto (id=%)', v_row.id; END IF;
      IF v_row.message_type NOT IN ('text') AND v_row.message_type IS NOT NULL AND v_row.media_url IS NULL THEN
        RAISE EXCEPTION 'media_url nulo para tipo % (id=%)', v_row.message_type, v_row.id; END IF;
      IF v_row.message_type='text' OR v_row.message_type IS NULL THEN
        v_endpoint := v_api_url||'/message/sendText/'||v_row.instance_name;
        v_body := jsonb_build_object('number',v_number,'text',v_row.content);
      ELSIF v_row.message_type='audio' THEN
        v_endpoint := v_api_url||'/message/sendMedia/'||v_row.instance_name;
        v_body := jsonb_build_object('number',v_number,'mediatype','audio','mimetype',coalesce(v_row.media_mime_type,'audio/ogg; codecs=opus'),'media',v_row.media_url,'ptt',coalesce(v_row.ptt,true));
      ELSE
        v_endpoint := v_api_url||'/message/sendMedia/'||v_row.instance_name;
        v_body := jsonb_build_object('number',v_number,'mediatype',v_row.message_type,'mimetype',coalesce(v_row.media_mime_type,'application/octet-stream'),'media',v_row.media_url,'caption',v_row.caption,'fileName',coalesce((v_row.metadata->>'fileName')::text,'file'));
      END IF;
      v_req_id := net.http_post(url:=v_endpoint, body:=v_body,
        headers:=jsonb_build_object('apikey',v_api_key,'Content-Type','application/json'),
        params:='{}', timeout_milliseconds:=10000);
      -- E86: egress log ADITIVO (falha de log NUNCA altera o dispatch)
      BEGIN
        PERFORM ops.log_pgnet_call(p_caller := 'fn_outbound_dispatch', p_url := v_endpoint,
          p_method := 'POST', p_via_gateway := false, p_note := 'queue_id='||v_row.id::text);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      UPDATE zapp.outbound_message_queue SET status='sending', external_id=v_req_id::text,
        sent_at=now(), updated_at=now() WHERE id=v_row.id;
      v_sent := v_sent+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE zapp.outbound_message_queue SET retry_count=coalesce(retry_count,0)+1,
        error_message=left(SQLERRM,500),
        failed_at=CASE WHEN coalesce(retry_count,0)+1>coalesce(max_retries,3) THEN now() ELSE NULL END,
        status=CASE WHEN coalesce(retry_count,0)+1>coalesce(max_retries,3) THEN 'failed' ELSE 'pending' END,
        updated_at=now() WHERE id=v_row.id;
      v_failed := v_failed+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('dispatched_at',now(),'sent',v_sent,'skipped',v_skipped,'failed',v_failed,'provider','evolution');
END;
$function$;

-- 2. E86: fn_reconcile_dispatch loga o GET via gateway
CREATE OR REPLACE FUNCTION zapp.fn_reconcile_dispatch()
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE v_req_id bigint;
BEGIN
  v_req_id := ops.fn_provider_call('GET', '/instance/fetchInstances', NULL, 8000);
  -- E86: egress log ADITIVO (falha de log NUNCA altera o reconcile)
  BEGIN
    PERFORM ops.log_pgnet_call(p_caller := 'fn_reconcile_dispatch',
      p_url := ops.fn_evo_url()||'/instance/fetchInstances',
      p_method := 'GET', p_via_gateway := true, p_note := 'via gateway E85');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM evo.rpc_boundary_reconcile_enqueue(v_req_id);
  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[fn_reconcile_dispatch] erro: %', SQLERRM;
  RETURN NULL;
END $function$;

-- 3. SEC-E89: wrapper de contrato em public + grants mínimos (só service_role)
CREATE OR REPLACE FUNCTION public.rpc_boundary_insert_consumer_stats(p_row jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'pg_catalog'
AS $function$
  SELECT evo.rpc_boundary_insert_consumer_stats(p_row);
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='rpc_boundary_insert_consumer_stats') THEN
    REVOKE ALL ON FUNCTION public.rpc_boundary_insert_consumer_stats(jsonb) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_boundary_insert_consumer_stats(jsonb) TO service_role;
  END IF;
END $$;
