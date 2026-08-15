-- =============================================================================
-- E26 — evo.fn_detect_instance_recreate (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_post direto por ops.pg_net_post()
-- para que a função evo.fn_detect_instance_recreate deixe de referenciar
-- net.* diretamente, corrigindo a violação do invariante I4.
-- =============================================================================

CREATE OR REPLACE FUNCTION evo.fn_detect_instance_recreate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = evo, ops, public
AS $$
DECLARE
  v_webhook_url     text;
  v_webhook_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM evo.evolution_instances
      WHERE instance_name = NEW.instance_name
        AND id <> NEW.id
    ) THEN
      v_webhook_url := ops.fn_get_vault_secret('n8n_bootstrap_alert_webhook');

      IF v_webhook_url IS NOT NULL THEN
        v_webhook_payload := jsonb_build_object(
          'event',         'instance_recreated',
          'instance_name', NEW.instance_name,
          'new_id',        NEW.id,
          'created_at',    NEW."createdAt"
        );

        PERFORM ops.pg_net_post(
          p_url     := v_webhook_url,
          p_body    := v_webhook_payload,
          p_headers := '{"Content-Type":"application/json"}'::jsonb
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION evo.fn_detect_instance_recreate IS
  'Detecta recriacao de instancia Evolution e notifica webhook n8n. '
  'E26 (2026-08-15): net.http_post substituido por ops.pg_net_post (invariante I4).';
