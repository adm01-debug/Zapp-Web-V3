-- =============================================================================
-- HOTFIX: 20260703210000_hotfix_fn_log_view_insert_bug.sql
--
-- Bug descoberto na validação exaustiva pós-deploy (PR #130):
--
-- fn_log_reconnection_attempt (SECURITY DEFINER) fazia:
--   INSERT INTO public.reconnection_logs ...
--
-- public.reconnection_logs é uma VIEW para zapp.reconnection_logs.
-- VIEWs simples sem INSTEAD OF trigger não são writáveis.
-- Resultado: INSERT ignorado silenciosamente, função retornava NULL,
-- log de auditoria de reconexão NUNCA era gravado no banco.
--
-- Fix:
--   1. Reescrever corpo: INSERT INTO zapp.reconnection_logs (tabela base)
--   2. Atualizar search_path=zapp, public, auth, extensions
--      (zapp primeiro garante resolução correta sem schema prefix)
--
-- Aplicado diretamente no DB via MCP (2026-07-03 15:46 BRT).
-- Esta migration garante idempotência em novos ambientes.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_log_reconnection_attempt(
  p_connection_id   uuid    DEFAULT NULL,
  p_instance_name   text    DEFAULT NULL,
  p_status          text    DEFAULT 'attempting',
  p_error_message   text    DEFAULT NULL,
  p_attempt_number  integer DEFAULT 1,
  p_qr_generated    boolean DEFAULT false,
  p_metadata        jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, auth, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  -- HOTFIX: inserir em zapp.reconnection_logs (BASE TABLE).
  -- public.reconnection_logs é VIEW sem INSTEAD OF trigger → não writável.
  INSERT INTO zapp.reconnection_logs
    (connection_id, instance_name, status, error_message,
     attempt_number, qr_generated, metadata)
  VALUES
    (p_connection_id, p_instance_name, p_status, p_error_message,
     p_attempt_number, p_qr_generated, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Manter ACL original: authenticated + service_role executam a função
GRANT EXECUTE ON FUNCTION public.fn_log_reconnection_attempt(
  uuid, text, text, text, integer, boolean, jsonb
) TO authenticated, service_role;

-- Verificação pós-aplicação
DO $$
DECLARE v_body text;
BEGIN
  SELECT prosrc INTO v_body
  FROM pg_proc
  WHERE proname='fn_log_reconnection_attempt'
    AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');

  IF v_body LIKE '%zapp.reconnection_logs%' THEN
    RAISE NOTICE 'PASS: fn_log_reconnection_attempt insere em zapp.reconnection_logs';
  ELSE
    RAISE WARNING 'FAIL: fn_log_reconnection_attempt ainda insere na VIEW public.*';
  END IF;
END;
$$;
