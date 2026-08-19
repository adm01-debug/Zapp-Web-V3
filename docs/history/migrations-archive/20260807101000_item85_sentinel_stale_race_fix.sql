-- ============================================================================
-- FIX: evo.fn_update_instance_health — race condition em stale detection
-- ============================================================================
-- Tipo: DDL fix
--
-- CONTEXTO:
--   A função evo.fn_update_instance_health (item 85 — migration 20260807091000)
--   verificava se a instância estava stale comparando o último evento com
--   now(). Em condições de carga alta, duas execuções concorrentes do cron
--   podiam:
--     1. Ambas detectarem instância stale
--     2. Ambas inserirem alertas duplicados em zapp.warroom_alerts
--     3. Operadores receberem notificações duplicadas
--
--   O fix implementa:
--     1. Advisory lock por instance_name para serializar execuções
--     2. Verificação de cooldown: não insere alerta se já existe um
--        alerta não-resolvido para a mesma instância nas últimas 2h
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_update_instance_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'evo', 'zapp', 'extensions'
AS $$
DECLARE
  v_lock_acquired boolean;
  v_instance      record;
  v_last_event    timestamptz;
  v_is_stale      boolean;
  v_cooldown_exists boolean;
BEGIN
  -- Advisory lock global para serializar execuções concorrentes
  -- hashtext('evo.fn_update_instance_health') = lock key único
  SELECT pg_try_advisory_lock(hashtext('evo.fn_update_instance_health'))
  INTO v_lock_acquired;

  IF NOT v_lock_acquired THEN
    RAISE NOTICE 'fn_update_instance_health: outra execução em andamento, pulando';
    RETURN;
  END IF;

  -- Iterar sobre instâncias ativas
  FOR v_instance IN
    SELECT instance_name
    FROM zapp.whatsapp_connections
    WHERE is_active = true
  LOOP
    -- Último evento recebido desta instância
    SELECT MAX(created_at) INTO v_last_event
    FROM evo.evolution_webhook_events_v2
    WHERE instance_name = v_instance.instance_name
      AND created_at > now() - interval '24 hours';

    -- Considera stale se não houve evento nas últimas 2 horas
    v_is_stale := (v_last_event IS NULL OR v_last_event < now() - interval '2 hours');

    IF v_is_stale THEN
      -- Cooldown: verificar se já existe alerta não-resolvido nas últimas 2h
      SELECT EXISTS (
        SELECT 1 FROM zapp.warroom_alerts
        WHERE source = 'evo-instance-health-check'
          AND entity = v_instance.instance_name
          AND alert_type IN ('warning', 'critical')
          AND resolved_at IS NULL
          AND created_at > now() - interval '2 hours'
      ) INTO v_cooldown_exists;

      IF NOT v_cooldown_exists THEN
        INSERT INTO zapp.warroom_alerts
          (alert_type, title, message, source, entity, severity)
        VALUES
          ('warning',
           format('Instância %s sem eventos recentes', v_instance.instance_name),
           format('Último evento recebido: %s. Verificar conexão WhatsApp.',
                  COALESCE(v_last_event::text, 'nunca')),
           'evo-instance-health-check',
           v_instance.instance_name,
           'high');
      END IF;
    END IF;
  END LOOP;

  PERFORM pg_advisory_unlock(hashtext('evo.fn_update_instance_health'));
END;
$$;

REVOKE ALL ON FUNCTION evo.fn_update_instance_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION evo.fn_update_instance_health() TO service_role, postgres;
