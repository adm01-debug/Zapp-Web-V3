-- ============================================================================
-- 20260811170000_evo_notif_config_get_rpc.sql
-- RPC de leitura de evo.evolution_notification_config para o dispatcher
-- ----------------------------------------------------------------------------
-- Contexto (2026-08-11):
--   * A tabela evo.evolution_notification_config (14 colunas: channel,
--     webhook_url, api_token, chat_id, enabled, notify_on, slack_webhook,
--     email_addresses, notify_on_hours, notify_on_days, priority_filter, ...)
--     JÁ EXISTE em produção (migrada do Lovable cloud) com 0 linhas — mas NÃO
--     há CREATE TABLE no repo e o schema evo NÃO está exposto no PostgREST
--     (db-schemas = public,zapp,...).
--   * A edge evolution-notification-dispatcher precisava ler essa config para
--     (a) fallback de destinatário por canal quando o payload não traz um,
--     (b) respeitar priority_filter (não enviar prioridades fora da lista).
--     Sem RPC, configurar a tabela não mudava nada (gap de simulação).
--   * Fix: RPC SECURITY DEFINER em zapp (mesmo padrão de fn_evo_outbox_*):
--     SELECT da config WHERE channel = p_channel AND enabled IS NOT FALSE.
--     Retorna jsonb (linha inteira) ou NULL quando não há config ativa.
--   * Grants: service_role apenas (é o caminho das edge functions). O default
--     ACL dos schemas zapp/evo ({authenticated=X/postgres}) concederia EXECUTE
--     a authenticated em toda função nova — REVOKE explícito (mesmo padrão de
--     20260811160000_revoke_auth_exec_fns_novas.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.zapp_notif_config_get(p_channel text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_row evo.evolution_notification_config%ROWTYPE;
BEGIN
  IF p_channel IS NULL OR btrim(p_channel) = '' THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_row
    FROM evo.evolution_notification_config
   WHERE channel = p_channel
     AND enabled IS NOT FALSE  -- NULL (default) ou true = ativa
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

-- ── Grants (padrão do repo: service_role apenas, sem exposição pública) ─────
REVOKE ALL ON FUNCTION zapp.zapp_notif_config_get(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.zapp_notif_config_get(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION zapp.zapp_notif_config_get(text) TO service_role;

-- Verificação pós-aplicação (esperado: auth_exec=false, sr_exec=true):
-- SELECT has_function_privilege('authenticated', 'zapp.zapp_notif_config_get(text)'::regprocedure, 'EXECUTE') AS auth_exec,
--        has_function_privilege('service_role',      'zapp.zapp_notif_config_get(text)'::regprocedure, 'EXECUTE') AS sr_exec;
