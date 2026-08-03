-- E17: get_contact_intelligence_by_phone — FIX F5-19
-- Hardcoded evolution_messages_wpp2 → evolution_messages (tabela particionada pai)
-- 3 ocorrências substituídas. Agora funciona com qualquer instância.
CREATE OR REPLACE FUNCTION zapp.get_contact_intelligence_by_phone(p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'zapp', 'evo'
AS $fn$ ...aplicado 2026-08-02... $fn$;
