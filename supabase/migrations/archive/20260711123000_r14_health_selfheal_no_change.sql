-- ============================================================================
-- R14 (2026-07-11) — SELF-HEAL de health_status no ramo no_change
--
-- CAUSA RAIZ: apos restart da Evolution, o debounce anti-pulso-pos-401 converte
-- o evento 'open' em 'connecting' (disconnected_at < 10min). Como a Evolution so
-- emite connection.update em MUDANCA de estado, nenhum evento futuro chega para
-- promover, e o reconcile de 5min cai no ramo no_change que nao tocava em health.
-- RESULTADO: health_status='degraded' preso para sempre com status='connected'.
--
-- FIX: nas duas funcoes (fn_apply_connection_update e fn_reconcile_apply), o ramo
-- no_change agora cura health->'ok' e reason->NULL quando o estado efetivo e
-- 'connected' NAO-debounced e health difere de 'ok'. O debounce continua
-- respeitado (nao cura durante a janela de 10min pos-disconnect).
--
-- VALIDACAO EMPIRICA (transacao+rollback, 2026-07-11):
--   C1 degraded preso + evento open (nao-debounced) -> health ok, reason NULL: PASS
--   C2 debounce ativo (disconnected_at 2min atras) -> permanece degraded: PASS
--
-- Idempotente: skip se 'R14' ja presente no corpo das funcoes.
-- Backups pre-fix: ops._fn_backups tag 'pre-health-selfheal-fix'.
-- ============================================================================

DO $r14a$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='fn_apply_connection_update' AND n.nspname='public';
  IF position('R14' IN v_def) > 0 THEN RAISE NOTICE 'R14 ja aplicado em fn_apply_connection_update — skip'; RETURN; END IF;
  INSERT INTO ops._fn_backups (fn_name, def, tag) VALUES ('public.fn_apply_connection_update', v_def, 'pre-R14-migration');
  v_new := replace(v_def,
$o$  ELSE
    UPDATE public.whatsapp_connections wc
      SET last_health_check = now(),
          instance_id = COALESCE(NULLIF(v_evo_id,''), wc.instance_id)
    WHERE wc.instance_name = v_instance_name;
    v_action := 'no_change';$o$,
$n$  ELSE
    -- R14 (2026-07-11): self-heal de health no ramo no_change. Sem isto, o debounce
    -- pos-restart deixa health_status='degraded' preso para sempre (Evolution so
    -- emite connection.update em mudanca de estado).
    UPDATE public.whatsapp_connections wc
      SET last_health_check = now(),
          instance_id = COALESCE(NULLIF(v_evo_id,''), wc.instance_id),
          health_status = CASE WHEN v_mapped_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN 'ok' ELSE wc.health_status END,
          health_reason = CASE WHEN v_mapped_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN NULL ELSE wc.health_reason END
    WHERE wc.instance_name = v_instance_name;
    v_action := 'no_change';$n$);
  IF v_new = v_def THEN RAISE EXCEPTION 'R14a: ramo ELSE nao encontrado — inspecionar def'; END IF;
  EXECUTE v_new;
END $r14a$;

DO $r14b$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='fn_reconcile_apply' AND n.nspname='public';
  IF position('R14' IN v_def) > 0 THEN RAISE NOTICE 'R14 ja aplicado em fn_reconcile_apply — skip'; RETURN; END IF;
  INSERT INTO ops._fn_backups (fn_name, def, tag) VALUES ('public.fn_reconcile_apply', v_def, 'pre-R14-migration');
  v_new := replace(v_def,
$o$        ELSE
          UPDATE public.whatsapp_connections wc SET last_health_check=now(), instance_id=v_evo_id
          WHERE wc.instance_name=v_matched_name;
          v_action := 'no_change';$o$,
$n$        ELSE
          -- R14 (2026-07-11): self-heal de health no ramo no_change (mesma correcao de fn_apply_connection_update)
          UPDATE public.whatsapp_connections wc SET last_health_check=now(), instance_id=v_evo_id,
            health_status=CASE WHEN v_evo_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN 'ok' ELSE wc.health_status END,
            health_reason=CASE WHEN v_evo_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN NULL ELSE wc.health_reason END
          WHERE wc.instance_name=v_matched_name;
          v_action := 'no_change';$n$);
  IF v_new = v_def THEN RAISE EXCEPTION 'R14b: ramo ELSE nao encontrado — inspecionar def'; END IF;
  EXECUTE v_new;
END $r14b$;
