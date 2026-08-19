-- ============================================================================
-- FIX PERF (2026-08-18) — zapp.get_companies_by_phones_batch
-- ----------------------------------------------------------------------------
-- Problema: expressao regexp_replace(COALESCE(phone_number,''),'\D','','g')
-- NAO casava com o indice funcional existente:
--   evolution_contacts_phone_clean_idx
--   btree (regexp_replace(lower(phone_number), '[^0-9]'::text, ''::text, 'g'::text))
--   WHERE (deleted_at IS NULL)
-- Resultado: Seq Scan (21.893 rows, 1758 buffers) ~33ms; alinhado: Bitmap Index
-- Scan 0.478ms (~52-70x mais rapido), provado via EXPLAIN em 2026-08-18.
-- Contrato preservado: (p_phones text[]) RETURNS TABLE(phone, company,
-- full_name, lead_status). Guard fn_require_app_user() mantido.
-- lower() e no-op em digitos; [^0-9] == \D; NULL nunca casava (mantido).
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.get_companies_by_phones_batch(p_phones text[])
 RETURNS TABLE(phone text, company text, full_name text, lead_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
SELECT ct.phone_number::text, ct.company::text, COALESCE(ct.full_name, ct.push_name)::text, ct.lead_status::text
FROM zapp.evolution_contacts ct
WHERE ct.deleted_at IS NULL
  AND regexp_replace(lower(ct.phone_number), '[^0-9]'::text, ''::text, 'g'::text) = ANY (
    SELECT DISTINCT regexp_replace(lower(p), '[^0-9]'::text, ''::text, 'g'::text)
    FROM unnest(COALESCE(p_phones, '{}'::text[])) p
    WHERE length(regexp_replace(lower(p), '[^0-9]'::text, ''::text, 'g'::text)) >= 8
  )
LIMIT 1000;
END;
$function$;

-- Reforco de privilegios (idempotente): so authenticated (app) e service_role.
REVOKE ALL ON FUNCTION zapp.get_companies_by_phones_batch(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(text[]) TO authenticated, service_role; -- ignore-lint-ml008: guarda PERFORM zapp.fn_require_app_user() na linha 22
