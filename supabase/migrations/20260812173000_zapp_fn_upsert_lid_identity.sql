-- zapp.fn_upsert_lid_identity — identidade LID↔PN (etapa 6/13 do plano LID-JID)
-- Aplicada em prod 12/08 (Hermes); migration p/ schema-as-code.
-- Regras: confidence high nunca rebaixa; source preservado em conflito;
-- raw_signal gravado; grants SÓ service_role (REVOKE PUBLIC obrigatório).
CREATE OR REPLACE FUNCTION zapp.fn_upsert_lid_identity(p_lid_jid text, p_pn_jid text DEFAULT NULL, p_phone_number text DEFAULT NULL, p_confidence text DEFAULT 'medium', p_source text DEFAULT 'usync', p_raw jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'evo,zapp' AS $$
DECLARE v_instance text := 'wpp2';
BEGIN
  INSERT INTO evo.lid_phone_map (lid_jid, instance_name, phone_jid, phone_number, confidence, source, raw_signal)
  VALUES (p_lid_jid, v_instance, p_pn_jid, p_phone_number, p_confidence, p_source, p_raw)
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    phone_jid = COALESCE(EXCLUDED.phone_jid, evo.lid_phone_map.phone_jid),
    phone_number = COALESCE(EXCLUDED.phone_number, evo.lid_phone_map.phone_number),
    confidence = CASE WHEN evo.lid_phone_map.confidence = 'high' OR EXCLUDED.confidence IN ('none','bootstrap_invalid') THEN evo.lid_phone_map.confidence WHEN EXCLUDED.confidence = 'high' THEN 'high' WHEN evo.lid_phone_map.confidence = 'none' THEN EXCLUDED.confidence ELSE evo.lid_phone_map.confidence END,
    source = CASE WHEN EXCLUDED.confidence = 'high' AND evo.lid_phone_map.confidence <> 'high' THEN EXCLUDED.source ELSE evo.lid_phone_map.source END,
    raw_signal = COALESCE(EXCLUDED.raw_signal, evo.lid_phone_map.raw_signal),
    updated_at = now();
  INSERT INTO evo.contact_identity (lid_jid, pn_jid, phone_number, instance_name, confidence, source, raw_signal)
  VALUES (p_lid_jid, p_pn_jid, p_phone_number, v_instance, p_confidence, p_source, p_raw)
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    pn_jid = COALESCE(EXCLUDED.pn_jid, evo.contact_identity.pn_jid),
    phone_number = COALESCE(EXCLUDED.phone_number, evo.contact_identity.phone_number),
    confidence = CASE WHEN evo.contact_identity.confidence = 'high' OR EXCLUDED.confidence IN ('none','bootstrap_invalid') THEN evo.contact_identity.confidence WHEN EXCLUDED.confidence = 'high' THEN 'high' WHEN evo.contact_identity.confidence = 'none' THEN EXCLUDED.confidence ELSE evo.contact_identity.confidence END,
    source = CASE WHEN EXCLUDED.confidence = 'high' AND evo.contact_identity.confidence <> 'high' THEN EXCLUDED.source ELSE evo.contact_identity.source END,
    raw_signal = COALESCE(EXCLUDED.raw_signal, evo.contact_identity.raw_signal),
    last_seen = now();
END
$$;
REVOKE ALL ON FUNCTION zapp.fn_upsert_lid_identity(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_upsert_lid_identity(text, text, text, text, text, jsonb) TO service_role;
