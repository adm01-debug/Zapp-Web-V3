-- Bugfix (06/08/2026): ops.fn_verify_alert_delivery v7 — três bugs de lógica em v6
-- ===========================================================================
-- L3 (P1 — Crítico): p_lookback pode se tornar negativo quando pg_net.ttl < 30 min
--   v6 linha 52: p_lookback := v_pgnet_ttl - interval '30 minutes';
--   Se pg_net.ttl = '20 min', resulta em -10 min.
--   Cursor WHERE a.created_at > now() - (-10 min) = now() + 10 min
--   → seleciona alertas do FUTURO → resultado sempre vazio → função retorna
--   tudo zerado SEM erro → acúmulo silencioso de alertas não processados.
--   Fix: GREATEST(..., interval '1 minute') garante p_lookback mínimo de 1 min.
--
-- L1 (P2 — Alto): blackout suprimido por 1 único sucesso em 1000 falhas
--   v6 linha 170: v_blackout := (v_ch_fail >= 3 AND v_ch_ok = 0);
--   1 entrega confirmada + 999 falhas → v_ch_ok = 1 → blackout = false.
--   Fix: threshold de 5% de taxa de sucesso
--     v_blackout := (v_ch_fail >= 3 AND (
--       v_ch_ok::float / NULLIF(v_ch_ok + v_ch_fail, 0) < 0.05
--     ))
--   NULLIF(0,0) → NULL → divisão retorna NULL → comparação retorna NULL
--   (tratado como false) → não dispara blackout quando não há dados.
--
-- L2 (P3 — Médio): supressão de duplicata de alarme usa janela hardcoded de 30 min
--   v6 linha 177: AND created_at > now() - interval '30 minutes'
--   Se p_blackout_win = 5 min, o NOT EXISTS verifica os últimos 30 min (6× a janela
--   de análise) → suprime alarmes que deveriam reaparecer a cada 5 min.
--   Se p_blackout_win = 4 h, verifica apenas 30 min → duplicatas a cada 30 min
--   dentro de uma blackout contínua de 4 h (muitos alarmes redundantes).
--   Fix: usar LEAST(p_blackout_win, interval '30 minutes') — a janela de supressão
--   acompanha a janela de análise, limitada a no máximo 30 min.
--
-- Sem outros cambios. v6 já tinha BUG-1 e BUG-2 corrigidos.
-- CREATE OR REPLACE é idempotente.
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
 SET search_path TO 'pg_catalog', 'ops', 'evo', 'zapp', 'net'
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
  -- v6: BUG-1 fix — current_setting com missing_ok=TRUE + COALESCE (mantido)
  v_pgnet_ttl := COALESCE(current_setting('pg_net.ttl', TRUE)::interval, interval '1 hour');

  IF p_lookback >= v_pgnet_ttl THEN
    -- L3 fix (v7): GREATEST evita p_lookback negativo quando pg_net.ttl < 30 min
    -- Exemplo: pg_net.ttl = '20 min' → v_pgnet_ttl - 30 min = -10 min (v6 bug)
    --          → cursor buscaria alertas do futuro → loop vazio sem erro visível
    p_lookback := GREATEST(v_pgnet_ttl - interval '30 minutes', interval '1 minute');
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

  -- Passivo histórico: FOR UPDATE SKIP LOCKED + ORDER BY id
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

  -- L1 fix (v7): threshold 5% de taxa de sucesso em vez de v_ch_ok = 0
  -- Evita supressão de blackout por 1 único sucesso em centenas de falhas.
  -- NULLIF(total, 0) = NULL → divisão = NULL → comparação = NULL → false (seguro).
  v_blackout := (
    v_ch_fail >= 3 AND
    (v_ch_ok::float / NULLIF(v_ch_ok + v_ch_fail, 0) < 0.05)
  );

  IF v_blackout
    AND NOT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts
       WHERE source = 'fn_verify_alert_delivery'
         -- L2 fix (v7): janela de supressão proporcional à janela de análise
         -- LEAST(..., 30 min) evita supressão excessiva quando p_blackout_win é pequeno
         -- e evita muitos alarmes duplicados quando p_blackout_win é grande
         AND created_at > now() - LEAST(p_blackout_win, interval '30 minutes')
    ) THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity)
    VALUES ('critical',
            'BLACKOUT DE NOTIFICACAO — nenhum alerta critico esta sendo entregue',
            format('Ultimas %s no canal: %s entregas confirmadas, %s falhas (taxa sucesso < 5%%). Alertas criticos NAO chegam a ninguem.',
                   p_blackout_win::text, v_ch_ok, v_ch_fail),
            'fn_verify_alert_delivery', 'notification_channel');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'versao', 'v7',
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
