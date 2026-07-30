-- FALHA CRÍTICA (auditoria sessão 6, 2026-07-05, achado #28 do workflow de revisão de
-- código): `public.fn_reconcile_apply()` (cron `*/5 * * * *`, caminho de poll via
-- `fetchInstances`) reproduzia de forma INDEPENDENTE o mesmo falso-positivo que
-- `fn_apply_connection_update()` (caminho de webhook) já havia sido corrigido para evitar
-- na migração `20260705005207_fix_apply_connection_update_flap_debounce.sql`.
--
-- Os dois caminhos leem o mesmo sinal de "conectado" (`connectionStatus`/`state: 'open'`)
-- de fontes ligeiramente diferentes (webhook `connection.update` vs. poll periódico de
-- `/instance/fetchInstances`), mas ambos podem capturar o mesmo pulso transitório de
-- `open` que o Baileys emite no início de um handshake de reconexão condenado (sessão
-- invalidada, 401 `device_removed`) — sem essa guarda, o poll do cron sozinho já bastava
-- para reintroduzir o "falso conectado" mesmo com o `fn_apply_connection_update` corrigido.
--
-- Fix: mesma janela de debounce de 10 minutos contra `disconnected_at` recente, agora
-- também em `fn_reconcile_apply`. A prioridade da instância debounced é rebaixada para 3
-- (igual a um 'connecting' genuíno) para que o guard de prioridade entre instâncias com o
-- mesmo número de telefone no mesmo lote continue funcionando sem caso especial — uma
-- entrada debounced perde corretamente para outra do mesmo telefone que reportou
-- 'connected' de verdade no mesmo lote. Verificado com 4 cenários (pulso isolado,
-- pulso vs. sibling melhor, pulso sem sibling, reconexão estável após 11min) — todos
-- corretos.

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

      -- FIX 2026-07-05 (sessao 6): mesmo debounce de fn_apply_connection_update. Reduz a
      -- prioridade tambem (3, igual 'connecting' genuino) para que o guard de prioridade
      -- abaixo continue funcionando sem caso especial: um 'open' debounced perde
      -- corretamente para outra entrada do mesmo telefone que reportou 'connected' de
      -- verdade no mesmo lote.
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
            health_status=CASE v_evo_status WHEN 'connected' THEN 'ok' WHEN 'connecting' THEN 'degraded' WHEN 'disconnected' THEN 'down' ELSE 'unknown' END,
            health_reason=CASE
                            WHEN v_debounced THEN format('reconcile: evo_state=%s debounced (disconnected_at=%s < 10min ago)', v_evo_raw, v_db_disconnected_at)
                            WHEN v_evo_status='connected' THEN NULL
                            ELSE format('reconcile: evo_state=%s (evo_name=%s)', v_evo_raw, v_inst->>'name') END,
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
