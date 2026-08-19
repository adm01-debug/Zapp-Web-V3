-- Runbook-2 (06/08/2026): Sync ops.fn_verify_alert_delivery v5 no repo (item A-4b)
-- ===========================================================================
-- Fix aplicado diretamente no banco em 05/08/2026 (v5) SEM cobertura versionada.
-- Este arquivo sincroniza o estado do DB ao repositório.
--
-- Problema (deadlock recorrente):
--   O pg_cron job 'verify-alert-delivery-10min' pode ter 2 instâncias rodando
--   ao mesmo tempo. Se o loop principal de uma instância tenta atualizar a
--   linha X enquanto outra instância (via passivo histórico) já tem X bloqueada,
--   ocorre lock-order inversion → deadlock.
--
-- Fix v5 aplicado:
--   1. SELECT...FOR UPDATE OF a SKIP LOCKED no loop principal → instância pula
--      linhas que outra worker já está processando.
--   2. SELECT...FOR UPDATE SKIP LOCKED no bloco "passivo histórico" (CTE b) →
--      mesmo mecanismo para o UPDATE do histórico.
--   3. ORDER BY a.id em ambos os blocos → lock ordering determinístico
--      (defesa-em-profundidade; o SKIP LOCKED já previne deadlock).
--
-- CREATE OR REPLACE é idempotente: se o banco já tem v5, re-aplicar é no-op.
-- ===========================================================================

CREATE OR REPLACE FUNCTION ops.fn_verify_alert_delivery(
  p_lookback     interval DEFAULT '04:00:00'::interval,
  p_max_attempts integer  DEFAULT 3,
  p_grace        interval DEFAULT '00:05:00'::interval,
  p_batch        integer  DEFAULT 300,
  p_blackout_win interval DEFAULT '02:00:00'::interval
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'evo', 'zapp', 'net', 'pg_catalog'
AS $function$
DECLARE
  v_a          record;
  v_requeued   int := 0;  v_exhausted  int := 0;
  v_delivered  int := 0;  v_pending    int := 0;
  v_unverifiable int := 0; v_backlog   int := 0;
  v_ch_ok      bigint;   v_ch_fail    bigint;
  v_blackout   boolean;
  v_pgnet_ttl  interval;
BEGIN
  -- v5 (2026-08-05): fix deadlock recorrente — SELECT FOR UPDATE SKIP LOCKED
  -- com ORDER BY id consistente em TODOS os acessos de escrita; evita
  -- lock-order inversion entre o loop e o passivo histórico.
  v_pgnet_ttl := current_setting('pg_net.ttl')::interval;

  IF p_lookback >= v_pgnet_ttl THEN
    p_lookback := v_pgnet_ttl - interval '30 minutes';
  END IF;

  FOR v_a IN
    SELECT a.id, a.alert_type, a.notified_at,
           coalesce((a.payload->>'notify_attempts')::int, 1) AS attempts,
           r.status_code, r.error_msg,
           (r.id IS NOT NULL) AS has_response,
           coalesce((a.payload->>'delivery_confirmed')::boolean, NULL) AS ja_confirmado
    FROM evo.evolution_alerts a
    LEFT JOIN net._http_response r
           ON r.id = (a.payload->>'notify_request_id')::bigint
    WHERE a.severity = 'critical'
      AND a.notified_at IS NOT NULL
      AND coalesce(a.resolved, false) = false
      AND a.payload ? 'notify_request_id'
      AND (a.payload->>'notify_request_id') ~ '^[0-9]+$'
      AND a.created_at > now() - p_lookback
    ORDER BY a.id
    LIMIT p_batch
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    IF v_a.has_response AND v_a.status_code BETWEEN 200 AND 299 THEN
      v_delivered := v_delivered + 1;
      IF v_a.ja_confirmado IS DISTINCT FROM true THEN
        UPDATE evo.evolution_alerts
           SET payload = payload || jsonb_build_object(
                 'delivery_confirmed', true,
                 'delivery_status', v_a.status_code,
                 'delivery_checked_at', now())
         WHERE id = v_a.id;
      END IF;
      CONTINUE;
    END IF;

    IF NOT v_a.has_response AND v_a.notified_at > now() - p_grace THEN
      v_pending := v_pending + 1;
      CONTINUE;
    END IF;

    IF NOT v_a.has_response THEN
      IF v_a.attempts < p_max_attempts THEN
        UPDATE evo.evolution_alerts
           SET notified_at = NULL,
               payload = payload || jsonb_build_object(
                 'delivery_confirmed', false,
                 'delivery_error', 'sem_resposta_pgnet_ttl',
                 'notify_attempts', v_a.attempts + 1,
                 'delivery_checked_at', now(),
                 'requeued_at', now())
         WHERE id = v_a.id;
        v_requeued := v_requeued + 1;
      ELSE
        UPDATE evo.evolution_alerts
           SET payload = payload || jsonb_build_object(
                 'delivery_confirmed', false,
                 'delivery_unverifiable', true,
                 'delivery_error', 'sem_resposta_pgnet_ttl',
                 'delivery_checked_at', now())
         WHERE id = v_a.id;
        v_unverifiable := v_unverifiable + 1;
      END IF;
    ELSE
      IF v_a.attempts < p_max_attempts THEN
        UPDATE evo.evolution_alerts
           SET notified_at = NULL,
               payload = payload || jsonb_build_object(
                 'delivery_confirmed', false,
                 'delivery_status', v_a.status_code,
                 'delivery_error', left(coalesce(v_a.error_msg, 'http_'||coalesce(v_a.status_code::text,'null')),200),
                 'notify_attempts', v_a.attempts + 1,
                 'delivery_checked_at', now(),
                 'requeued_at', now())
         WHERE id = v_a.id;
        v_requeued := v_requeued + 1;
      ELSE
        UPDATE evo.evolution_alerts
           SET payload = payload || jsonb_build_object(
                 'delivery_confirmed', false,
                 'delivery_status', v_a.status_code,
                 'delivery_exhausted', true,
                 'delivery_checked_at', now())
         WHERE id = v_a.id;
        v_exhausted := v_exhausted + 1;
      END IF;
    END IF;
  END LOOP;

  -- Passivo histórico: FOR UPDATE SKIP LOCKED + ORDER BY id (mesma ordem do loop)
  WITH b AS (
    UPDATE evo.evolution_alerts
       SET payload = payload || jsonb_build_object(
             'delivery_confirmed', false,
             'delivery_unverifiable', true,
             'delivery_error', 'resposta_pgnet_expirada_antes_da_verificacao',
             'delivery_checked_at', now())
     WHERE id IN (
       SELECT a.id FROM evo.evolution_alerts a
        WHERE a.severity = 'critical'
          AND a.notified_at IS NOT NULL
          AND coalesce(a.resolved, false) = false
          AND a.payload ? 'notify_request_id'
          AND NOT (a.payload ? 'delivery_checked_at')
          AND a.created_at <= now() - p_lookback
        ORDER BY a.id
        LIMIT p_batch
        FOR UPDATE SKIP LOCKED)
    RETURNING 1
  ) SELECT count(*) INTO v_backlog FROM b;

  SELECT count(*) FILTER (WHERE (payload->>'delivery_confirmed')::boolean IS TRUE),
         count(*) FILTER (WHERE (payload->>'delivery_confirmed')::boolean IS FALSE)
    INTO v_ch_ok, v_ch_fail
    FROM evo.evolution_alerts
   WHERE severity = 'critical'
     AND payload ? 'delivery_confirmed'
     AND (payload->>'delivery_checked_at')::timestamptz > now() - p_blackout_win;

  v_blackout := (v_ch_fail >= 3 AND v_ch_ok = 0);

  IF v_blackout
    AND NOT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts
       WHERE source = 'fn_verify_alert_delivery'
         AND created_at > now() - interval '30 minutes'
    ) THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity)
    VALUES ('critical',
            'BLACKOUT DE NOTIFICACAO — nenhum alerta critico esta sendo entregue',
            format('Ultimas %s no canal: %s entregas confirmadas, %s falhas. Alertas criticos NAO chegam a ninguem.',
                   p_blackout_win::text, v_ch_ok, v_ch_fail),
            'fn_verify_alert_delivery', 'notification_channel');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entregues', v_delivered,
    'reenfileirados', v_requeued,
    'esgotados', v_exhausted,
    'aguardando_graca', v_pending,
    'nao_verificaveis', v_unverifiable,
    'passivo_historico_marcado', v_backlog,
    'canal_confirmadas', v_ch_ok,
    'canal_falhas', v_ch_fail,
    'blackout', v_blackout,
    'lookback_efetivo', p_lookback::text,
    'pgnet_ttl', v_pgnet_ttl::text,
    'invariante_lookback_lt_ttl', p_lookback < v_pgnet_ttl
  );
END;
$function$;
