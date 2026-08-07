-- Revoga EXECUTE PUBLIC/anon de evo.search_contacts_gin (SECURITY DEFINER)
-- Gate D-8: v_security_audit acusava "⚠ EXPOSTO a anon" (pré-existente, descoberto
-- durante espelho das migrations da onda Kong — PR #987).
-- Função de busca de contatos: usada pelo front autenticado (RPC), nunca por anon.
-- Mantém EXECUTE para authenticated e service_role (superuser).

REVOKE EXECUTE ON FUNCTION evo.search_contacts_gin(text, integer, integer, double precision) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION evo.search_contacts_gin(text, integer, integer, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION evo.search_contacts_gin(text, integer, integer, double precision) TO authenticated;
