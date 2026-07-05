-- S6-5 (auditoria sessão 6, 2026-07-05): drift de schema — estas 4 funções existiam
-- apenas no banco ao vivo, sem nenhuma migração correspondente no repositório (achado
-- durante a investigação do outage documentado em
-- docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md). Um `supabase db reset` ou
-- provisionamento novo a partir deste repositório não as recriaria.
--
-- Esta migração captura as 4 restantes da família reconcile/alerta EXATAMENTE como
-- estavam ao vivo no momento da auditoria — SEM nenhuma mudança de comportamento.
-- (`fn_reconcile_apply` e `fn_auto_resolve_baileys_alerts`, que TINHAM bugs reais, foram
-- corrigidas separadamente em
-- `20260705011420_fix_reconcile_apply_unclamped_status_and_baileys_ack.sql`.)
--
-- Revisadas nesta sessão e consideradas corretas como estão:
--   - fn_alert_health_score_degraded: cria alerta quando o health score cai abaixo do
--     threshold, com guarda de 2h contra alertas duplicados. Sem problemas encontrados.
--   - fn_auto_resolve_alerts: ack de alertas não-críticos após N horas (default 24). Já
--     exclui severity='critical' corretamente — é o padrão que fn_auto_resolve_baileys_alerts
--     não seguia (corrigido na migração acima).
--   - fn_auto_resolve_media_alerts: self-healing da fila de download de mídia (reseta
--     itens travados em 'processing' há >30min, marca falhos com 5+ tentativas como
--     'abandoned'). Sem problemas encontrados.
--   - fn_reconcile_dispatch: dispara o GET assíncrono (pg_net) para /instance/fetchInstances
--     e registra o job em evo.evolution_reconcile_jobs para fn_reconcile_apply processar
--     depois. Sem problemas encontrados.
--
-- Ainda restam, fora do escopo desta sessão (não é a família reconcile/alerta):
-- dezenas de outras funções `public.fn_*`/`evo.fn_*`/`zapp.fn_*` sem migração
-- correspondente — recomendação de uma sessão dedicada de "schema sync" no relatório.

CREATE OR REPLACE FUNCTION public.fn_alert_health_score_degraded(p_threshold numeric DEFAULT 70)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'zapp', 'evo'
AS $function$
DECLARE
  v_hs jsonb; v_score numeric; v_grade text; v_already boolean;
BEGIN
  v_hs := public.fn_system_health_score();
  v_score := (v_hs->>'score')::numeric;
  v_grade := v_hs->>'grade';
  IF v_score >= p_threshold THEN
    RETURN jsonb_build_object('status','ok','score',v_score,'grade',v_grade);
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM evo.evolution_alerts
    WHERE alert_type='health_score_degraded'
      AND created_at > now()-INTERVAL '2 hours'
      AND resolved_at IS NULL
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('status','already_alerted','score',v_score);
  END IF;
  INSERT INTO evo.evolution_alerts(alert_type,severity,title,message,payload)
  VALUES(
    'health_score_degraded',
    CASE WHEN v_score<50 THEN 'critical' WHEN v_score<65 THEN 'high' ELSE 'medium' END,
    'Health Score DEGRADADO: '||round(v_score,1)||'% (Grade '||v_grade||')',
    'Score '||round(v_score,1)||'% abaixo do threshold '||p_threshold||'%. Grade: '||v_grade||'. Verifique o breakdown.',
    jsonb_build_object('score',v_score,'grade',v_grade,'threshold',p_threshold,'breakdown',v_hs->'breakdown')
  );
  RETURN jsonb_build_object(
    'status','alert_created','score',v_score,'grade',v_grade,
    'severity',CASE WHEN v_score<50 THEN 'critical' WHEN v_score<65 THEN 'high' ELSE 'medium' END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_resolve_alerts(p_hours integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $function$
DECLARE v_count integer;
BEGIN UPDATE evolution_alerts SET acknowledged=true,acknowledged_at=now() WHERE acknowledged=false AND created_at<now()-make_interval(hours:=p_hours) AND severity NOT IN ('critical'); GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END; $function$;

CREATE OR REPLACE FUNCTION public.fn_auto_resolve_media_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $function$
DECLARE
  v_fixed integer := 0;
BEGIN
  UPDATE media_download_queue SET status='pending', retry_count = retry_count + 1
  WHERE status='processing' AND processed_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  UPDATE media_download_queue SET status='abandoned'
  WHERE status='failed' AND retry_count >= 5;

  RETURN v_fixed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reconcile_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'net'
AS $function$
DECLARE
  v_api_url text;
  v_api_key text;
  v_req_id  bigint;
BEGIN
  SELECT decrypted_secret INTO v_api_url FROM vault.decrypted_secrets WHERE name = 'evolution_api_url';
  SELECT decrypted_secret INTO v_api_key FROM vault.decrypted_secrets WHERE name = 'evolution_api_key';

  IF v_api_url IS NULL OR v_api_key IS NULL THEN
    RAISE EXCEPTION '[fn_reconcile_dispatch] vault.evolution_api_url ou evolution_api_key faltando';
  END IF;

  v_req_id := net.http_get(
    url := v_api_url || '/instance/fetchInstances',
    headers := jsonb_build_object('apikey', v_api_key, 'Accept', 'application/json'),
    timeout_milliseconds := 8000
  );

  -- FIX: ON CONFLICT DO NOTHING evita crash quando pg_net reutiliza request_id
  -- (acontece após reinicializações de DB quando a sequência reseta)
  INSERT INTO evo.evolution_reconcile_jobs (request_id) VALUES (v_req_id)
  ON CONFLICT (request_id) DO UPDATE
    SET dispatched_at = now();

  RETURN v_req_id;
END;
$function$;
