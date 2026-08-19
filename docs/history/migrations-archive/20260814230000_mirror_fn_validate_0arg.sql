-- =============================================================================
-- MIRROR DB->REPO (2026-08-14, validacao final V5) - overload 0-arg de
-- fn_validate_whatsapp_connection_url (TRIGGER)
--
-- A migration 20260805000000_delta_724 registra uma versao antiga (vault
-- direto, fail-secure com RAISE); PRODUCAO roda o corpo abaixo (validacao de
-- webhook_url contra ops.fn_evo_url, fail-open, retorna NEW). O trigger
-- trg_validate_whatsapp_connection_url (20260805140000) depende desta fn -
-- NUNCA dropar (quebraria F6-12). Espelho do corpo real - idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_allowed_url TEXT; BEGIN IF NEW.api_type = 'official' THEN RETURN NEW; END IF; BEGIN v_allowed_url := ops.fn_evo_url(); EXCEPTION WHEN OTHERS THEN v_allowed_url := NULL; END; IF v_allowed_url IS NULL THEN RETURN NEW; END IF; IF NEW.webhook_url IS NOT NULL AND NEW.webhook_url !~ ('^' || regexp_replace(v_allowed_url, '([.+?^=!:${}()|\[\]\/\\])', E'\\\1', 'g')) THEN RAISE WARNING 'Webhook URL difere do evolution_api_url: %', NEW.webhook_url; END IF; RETURN NEW; END; $function$
