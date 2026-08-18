-- ============================================================================
-- Debug helpers LID/JID (reconciliacao repo x DB, 2026-08-18)
-- ============================================================================
-- As funcoes debug_lid_* existem em producao (criadas em sessao de diagnostico
-- de WhatsApp LID vs JID) mas nao tinham migration no repo — o
-- zapp-schema-drift-gate acusava drift (I7). Corpos copiados 1:1 do DB
-- (pg_get_functiondef) — CREATE OR REPLACE idempotente, sem efeito em prod.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.debug_lid_case(p_json jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$ DECLARE v_out text; BEGIN SELECT CASE WHEN COALESCE(c->>'id', c->>'remoteJid') LIKE '%@lid' THEN (SELECT ci.phone_number FROM evo.contact_identity ci WHERE ci.lid_jid = COALESCE(c->>'id', c->>'remoteJid') AND ci.phone_number ~ '^[0-9]{10,14}$' ORDER BY ci.last_seen DESC LIMIT 1) ELSE 'no-lid' END INTO v_out FROM jsonb_array_elements(p_json) AS c LIMIT 1; RETURN v_out; END; $function$;

CREATE OR REPLACE FUNCTION zapp.debug_lid_flow(p_json jsonb)
 RETURNS TABLE(jid text, case_phone text, resolved text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$ DECLARE v_jid text; v_phone text; BEGIN FOR v_jid IN SELECT COALESCE(c->>'id', c->>'remoteJid') FROM jsonb_array_elements(p_json) AS c LOOP v_phone := CASE WHEN v_jid LIKE '%@lid' THEN (SELECT ci.phone_number FROM evo.contact_identity ci WHERE ci.lid_jid = v_jid AND ci.phone_number ~ '^[0-9]{10,14}$' ORDER BY ci.last_seen DESC LIMIT 1) ELSE 'not-lid' END; RETURN QUERY SELECT v_jid, v_phone, (SELECT ci.phone_number FROM evo.contact_identity ci WHERE ci.lid_jid = v_jid LIMIT 1); END LOOP; END; $function$;

CREATE OR REPLACE FUNCTION zapp.debug_lid_lookup(p_lid text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$ DECLARE v_out text; BEGIN SELECT ci.phone_number INTO v_out FROM evo.contact_identity ci WHERE ci.lid_jid = p_lid AND ci.phone_number ~ '^[0-9]{10,14}$' ORDER BY ci.last_seen DESC LIMIT 1; RETURN v_out; END; $function$;
