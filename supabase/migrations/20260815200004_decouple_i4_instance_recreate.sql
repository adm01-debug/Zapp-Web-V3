-- ============================================================
-- Decouple I4: remover URL hardcoded do webhook n8n de
-- evo.fn_detect_instance_recreate (trigger ativo em
-- evo.evolution_connection_history).
--
-- Etapa: I4 (pg_net / decouple de URLs hardcoded)
-- Data: 2026-08-15
-- Idempotente — CREATE OR REPLACE.
--
-- Mudança: URL do webhook n8n passa a ser resolvida via
-- ops.fn_get_vault_secret('n8n_bootstrap_alert_webhook') com
-- fallback no literal atual. Nenhuma outra alteração de lógica.
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_detect_instance_recreate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_instance_id text;
  v_cooldown_ok boolean;
  v_webhook_payload jsonb;
  v_webhook_url text;
BEGIN
  IF NEW.instance_name != 'wpp2' THEN
    RETURN NEW;
  END IF;

  IF NEW.state NOT IN ('closed', 'disconnected', 'logout') THEN
    RETURN NEW;
  END IF;

  -- Cooldown 5min
  SELECT NOT EXISTS(
    SELECT 1 FROM evo.evolution_bootstrap_log
    WHERE instance_name = NEW.instance_name
      AND created_at > now() - interval '5 minutes'
      AND triggered_by = 'auto-connection-trigger'
  ) INTO v_cooldown_ok;

  IF NOT v_cooldown_ok THEN
    RETURN NEW;
  END IF;

  -- Buscar instanceId
  SELECT id::text INTO v_instance_id
  FROM zapp.evolution_instance_credentials
  WHERE instance_name = NEW.instance_name AND is_active = true
  LIMIT 1;

  -- 1. Registrar diretamente no bootstrap_log (a ação crítica)
  INSERT INTO evo.evolution_bootstrap_log (
    instance_name, instance_id, triggered_by,
    settings_applied, rabbitmq_events_count, status, notes
  ) VALUES (
    NEW.instance_name,
    COALESCE(v_instance_id, 'unknown'),
    'auto-connection-trigger',
    NULL, NULL,
    'registered',
    format('Estado %s→%s detectado em %s. Verificar se instância foi recriada.',
           COALESCE(NEW.previous_state, 'unknown'), NEW.state, NEW.created_at)
  );

  -- 2. Chamar n8n webhook via pg_net para notificação externa
  v_webhook_url := COALESCE(ops.fn_get_vault_secret('n8n_bootstrap_alert_webhook'), 'https://webhook.atomicabr.com.br/webhook/evolution-bootstrap-alert');
  v_webhook_payload := jsonb_build_object(
    'event', 'LOGOUT_INSTANCE',
    'instance', NEW.instance_name,
    'instanceId', COALESCE(v_instance_id, 'unknown'),
    'state', NEW.state,
    'previous_state', NEW.previous_state,
    'detected_at', NEW.created_at
  );

  PERFORM net.http_post(
    url := v_webhook_url,
    body := v_webhook_payload,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RAISE WARNING 'Bootstrap Alert: wpp2 state→%. Bootstrap registered + n8n notified.', NEW.state;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não falhar o INSERT principal por erro no webhook
  RAISE WARNING 'Bootstrap trigger error (non-fatal): %', SQLERRM;
  RETURN NEW;
END;
$function$;
