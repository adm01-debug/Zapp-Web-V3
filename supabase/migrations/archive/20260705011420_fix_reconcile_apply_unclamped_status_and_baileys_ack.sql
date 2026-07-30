-- FALHA (auditoria sessão 6, 2026-07-05) — dois achados independentes na família de
-- funções de reconciliação/alerta, previstos por simulação de cenários antes de aplicar.

-- 1) public.fn_reconcile_apply(): o mapeamento de `connectionStatus` (vindo do
-- fetchInstances da Evolution) tinha fallback `ELSE COALESCE(v_evo_raw,'unknown')` — ou
-- seja, qualquer valor fora de 'open'/'connecting'/'close' (null, variante de
-- maiúscula/minúscula, um estado novo que a Evolution venha a introduzir) virava esse
-- valor CRU sem clamp, e a UPDATE seguinte em `whatsapp_connections.status` violava o
-- CHECK constraint `whatsapp_connections_status_check` (só aceita 'connected',
-- 'disconnected', 'connecting', 'qr_pending', 'banned', 'logged_out'). Uma exceção não
-- capturada nesse ponto aborta TODA a execução de fn_reconcile_apply() — inclusive as
-- instâncias já processadas no mesmo lote antes da linha problemática. Simulado antes do
-- fix: os inputs NULL, 'OPEN' (maiúsculo), 'unknown_future_state' e '' todos violavam o
-- constraint; depois do fix, todos mapeiam com segurança para 'disconnected' (mesmo
-- fallback conservador já usado em fn_apply_connection_update).
--
-- 2) public.fn_auto_resolve_baileys_alerts(): fazia ack de qualquer alerta com
-- `alert_type ILIKE '%baileys%'` após 6h, sem excluir `severity='critical'` — ao
-- contrário da função irmã fn_auto_resolve_alerts(), que explicitamente preserva
-- alertas críticos. Um alerta crítico de desconexão (ex.: tipo contendo "baileys") podia
-- ser silenciado sem qualquer confirmação de que o problema foi resolvido — mesma classe
-- de risco do S6-4 (alertas críticos fechados sem verificação). Verificado com dois
-- alertas sintéticos (severidade critical/medium, ambos >6h): antes do fix ambos seriam
-- acknowledged; depois do fix, só o medium é.
--
-- Ver docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md para o contexto completo da sessão.

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

    -- FIX 2026-07-05 (sessao 6): fallback seguro — nunca viola whatsapp_connections_status_check.
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

      SELECT wc.instance_name, wc.status INTO v_matched_name, v_db_status
      FROM public.whatsapp_connections wc WHERE wc.instance_name=(v_inst->>'name');

      IF NOT FOUND AND v_phone IS NOT NULL AND v_phone!='' THEN
        SELECT wc.instance_name, wc.status INTO v_matched_name, v_db_status
        FROM public.whatsapp_connections wc
        WHERE wc.phone_number=v_phone AND wc.is_active=true LIMIT 1;
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
            health_status=CASE v_evo_status WHEN 'connected' THEN 'ok' WHEN 'connecting' THEN 'degraded' WHEN 'disconnected' THEN 'down' ELSE 'unknown' END,
            health_reason=CASE WHEN v_evo_status='connected' THEN NULL ELSE format('reconcile: evo_state=%s (evo_name=%s)', v_evo_raw, v_inst->>'name') END,
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

      v_results := v_results || jsonb_build_object('instance',COALESCE(v_matched_name,v_inst->>'name'),'evo_name',v_inst->>'name','action',v_action,'old',v_db_status,'new',v_evo_status);
      request_id := v_job.request_id; instance_name := COALESCE(v_matched_name,v_inst->>'name'); action := v_action; old_status := v_db_status; new_status := v_evo_status;
      RETURN NEXT;
      v_matched_name := NULL; v_db_status := NULL;
    END LOOP;

    UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http, result=v_results WHERE id=v_job.id;
    v_results := '[]'::jsonb;
  END LOOP;
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_resolve_baileys_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $function$
DECLARE v integer;
BEGIN
  -- FIX 2026-07-05 (sessao 6): agora exclui severity='critical', alinhado com
  -- fn_auto_resolve_alerts().
  UPDATE evolution_alerts SET acknowledged=true, acknowledged_at=now()
  WHERE acknowledged=false AND alert_type ILIKE '%baileys%' AND created_at < now()-interval '6 hours'
    AND severity NOT IN ('critical');
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$function$;
