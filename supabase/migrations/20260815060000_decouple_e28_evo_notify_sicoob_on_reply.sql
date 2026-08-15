-- =============================================================================
-- E28 — evo.fn_notify_sicoob_on_reply (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_post direto por ops.pg_net_post()
-- para corrigir a violação do invariante I4.
-- =============================================================================

CREATE OR REPLACE FUNCTION evo.fn_notify_sicoob_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = evo, ops, public
AS $$
DECLARE
  v_edge_url text;
BEGIN
  v_edge_url := ops.fn_get_vault_secret('sicoob_bridge_edge_url');

  IF v_edge_url IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM ops.pg_net_post(
    p_url  := v_edge_url || '/sicoob-bridge-reply',
    p_body := jsonb_build_object(
                'contact_id', NEW.contact_id,
                'content',    NEW.content,
                'message_id', NEW.id,
                'created_at', NEW.created_at
              ),
    p_headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION evo.fn_notify_sicoob_on_reply IS
  'Notifica bridge Sicoob ao receber resposta em conversa Evolution. '
  'E28 (2026-08-15): net.http_post substituido por ops.pg_net_post (invariante I4).';
