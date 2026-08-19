-- Migration: fn_checar_inbound_zerado — ampliar janela de silêncio para 19:00-07:59 BRT
-- Detectado em auditoria exaustiva 2026-08-13/14
--
-- Problema: silêncio antigo era 23:00-06:59 BRT. Tráfego real da Promo Brindes
-- cai para < 30 msgs/h após 18h BRT (padrão histórico: 12-35 msgs em 19-21h BRT).
-- Isso causava alerta ingestion_zero_inbound falso-positivo a partir das 19h BRT diariamente.
-- Fix: ampliar silêncio para 19:00-07:59 BRT, cobrir o horário fora do comercial real.

CREATE OR REPLACE FUNCTION evo.fn_checar_inbound_zerado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, pg_catalog
AS $$
DECLARE
  v_upserts  bigint;
  v_janela   interval := '1 hour';
  v_cooldown interval := '6 hours';
  v_ja_alertou boolean := false;
  v_hora_local int;
  v_silencio   boolean := false;
BEGIN
  SELECT count(*) INTO v_upserts
  FROM zapp.webhook_events_processed
  WHERE event_type = 'messages.upsert'
    AND processed_at > now() - v_janela;

  -- Janela de silêncio comercial (19:00-07:59 BRT):
  -- Tráfego cai para < 30 msgs/h após 18h BRT (padrão histórico confirmado).
  -- Antes era 23:00-06:59; ampliado em 2026-08-13 após auditoria de falsos positivos.
  SELECT extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::int INTO v_hora_local;
  IF v_hora_local >= 19 OR v_hora_local < 8 THEN
    v_silencio := true;
  END IF;

  IF v_upserts = 0 AND NOT v_silencio THEN
    SELECT EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type = 'ingestion_zero_inbound'
        AND created_at > now() - v_cooldown
    ) INTO v_ja_alertou;

    IF NOT v_ja_alertou THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      VALUES (
        'ingestion_zero_inbound',
        'high',
        'Inbound zerado ha mais de 1h — pipeline pode estar parado',
        format(
          'Nenhum evento messages.upsert registrado em zapp.webhook_events_processed na ultima hora (janela %s). '
          'Horario comercial: verificar pipeline inbound: consumer, edge evolution-webhook, view public.evolution_messages.',
          v_janela::text
        ),
        jsonb_build_object(
          'upserts_ultima_hora', v_upserts,
          'janela', v_janela::text,
          'fonte', 'zapp.webhook_events_processed',
          'cooldown', v_cooldown::text,
          'silencio_comercial', v_silencio,
          'hora_brt', v_hora_local,
          'janela_silencio', '19:00-07:59 BRT',
          'detectado_em', now()
        )
      );
    END IF;
  ELSIF v_upserts > 0 THEN
    UPDATE zapp.evolution_alerts
    SET resolved_at = now(), resolved_by = 'fn_checar_inbound_zerado'
    WHERE alert_type = 'ingestion_zero_inbound'
      AND resolved_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'upserts_ultima_hora', v_upserts,
    'silencio_comercial', v_silencio,
    'hora_brt', v_hora_local,
    'alerta_emitido', (v_upserts = 0 AND NOT v_ja_alertou AND NOT v_silencio)
  );
END
$$;
