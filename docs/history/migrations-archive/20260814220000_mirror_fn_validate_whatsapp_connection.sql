-- =============================================================================
-- MIRROR DB→REPO 2026-08-14: fn_validate_whatsapp_connection_url usava
-- vault.decrypted_secrets direto na migration 20260805000000_delta_724_orphaned_objects.sql;
-- o DB de producao ja usa ops.fn_evo_url/ops.fn_evo_key (validado V6/V10);
-- espelho do corpo real — idempotente.
--
-- Contexto (DB-as-source): a migration 20260805000000_delta_724_orphaned_objects.sql
-- ainda registra a versao antiga (fn trigger 0-arg que le vault.decrypted_secrets
-- direto, sem ops.fn_evo_url/ops.fn_evo_key). O banco de producao roda a versao
-- real abaixo (jsonb, p_instance text, credenciais via ops.fn_evo_url/ops.fn_evo_key),
-- confirmada na validacao V6/V10 em 2026-08-14.
--
-- Corpo copiado via pg_get_functiondef do banco de produção em 2026-08-14.
-- IDEMPOTENTE: CREATE OR REPLACE — pode rodar quantas vezes.
-- Nome sugerido no repo (posicao posterior a 20260814210000):
--   20260814220000_mirror_fn_validate_whatsapp_connection_url.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url(p_instance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp','evo','public','pg_catalog'
AS $function$ DECLARE v_url text; v_key text; v_endpoint text; v_req_id bigint; BEGIN v_url := ops.fn_evo_url(); v_key := ops.fn_evo_key(); IF v_url IS NULL THEN RETURN jsonb_build_object('ok',false,'error','evolution_api_url ausente no vault'); END IF; v_endpoint := v_url||'/instance/connectionState/'||p_instance; v_req_id := net.http_get(url:=v_endpoint, headers:=jsonb_build_object('apikey',coalesce(v_key,''),'Content-Type','application/json'), params:='{}', timeout_milliseconds:=5000); RETURN jsonb_build_object('ok',true,'instance',p_instance,'req_id',v_req_id,'provider','evolution'); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM,'instance',p_instance); END; $function$
