-- =============================================================================
-- E17/I4 — ops.fn_evo_url_v2 / ops.fn_evo_key_v2 (Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: criar variantes _v2 das funções de acesso ao vault para Evolution API.
-- As versões _v2 têm assinatura versionada explícita, permitindo que o gateway
-- único referencie uma versão estável enquanto as funções originais são
-- gradualmente deprecadas no processo de desacoplamento (Fases 2–4).
--
-- Correção I4/E17: rtrim adicionado em fn_evo_url_v2 para evitar dupla-barra
-- quando a URL do vault termina com /.
--
-- SEGURANÇA:
-- - SECURITY DEFINER: executa com privilégios do proprietário (não do chamador)
-- - SET search_path: restrito a vault, ops, public (sem escalada de schema)
-- - GRANT EXECUTE: somente via service_role (sem exposição a authenticated)
--   → ML-008 compliance: nenhum GRANT EXECUTE TO authenticated neste arquivo
--
-- Idempotente — CREATE OR REPLACE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ops.fn_evo_url_v2() — URL da Evolution API (vault, assinatura versionada v2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.fn_evo_url_v2()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, ops, public
AS $$
BEGIN
  RETURN rtrim((
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'evolution_api_url'
    LIMIT 1
  ), '/');
END;
$$;

COMMENT ON FUNCTION ops.fn_evo_url_v2 IS
  'v2 — Retorna a URL base da Evolution API lida do Supabase Vault. '
  'Aplica rtrim(..., ''/'') para evitar dupla-barra quando a URL do vault '
  'termina com / (callers concatenam ''/endpoint''). '
  'Assinatura versionada estável para uso pelo gateway único '
  '(supabase/functions/_shared/providers/evolution/client.ts). '
  'Executa com privilégios do owner (definer); search_path restrito; sem GRANT a authenticated (ML-008). '
  'Criado em E17 (2026-08-15); corrigido em I4 (rtrim). Substitui ops.fn_evo_url() (deprecada).';

-- -----------------------------------------------------------------------------
-- ops.fn_evo_key_v2() — API key da Evolution API (vault, assinatura versionada v2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.fn_evo_key_v2()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, ops, public
AS $$
BEGIN
  RETURN (
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'evolution_api_key'
    LIMIT 1
  );
END;
$$;

COMMENT ON FUNCTION ops.fn_evo_key_v2 IS
  'v2 — Retorna a API key da Evolution API lida do Supabase Vault. '
  'Assinatura versionada estável para uso pelo gateway único '
  '(supabase/functions/_shared/providers/evolution/client.ts). '
  'Executa com privilégios do owner (definer); search_path restrito; sem GRANT a authenticated (ML-008). '
  'Criado em E17 (2026-08-15). Substitui ops.fn_evo_key() (deprecada).';

-- -----------------------------------------------------------------------------
-- Marcar funções originais como deprecadas
-- (as funções originais não estão em nenhuma migration — foram criadas
--  diretamente no prod DB antes do versionamento do schema. Os COMMENTs
--  abaixo atualizam os comentários no catalog para sinalizar a deprecação.)
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION ops.fn_evo_url IS
  '[DEPRECATED — usar ops.fn_evo_url_v2()] '
  'Retorna a URL da Evolution API do vault. '
  'Será removida após a Fase 2 do desacoplamento (E25+). '
  'Não reutilizar em novas funções.';

COMMENT ON FUNCTION ops.fn_evo_key IS
  '[DEPRECATED — usar ops.fn_evo_key_v2()] '
  'Retorna a API key da Evolution API do vault. '
  'Será removida após a Fase 2 do desacoplamento (E25+). '
  'Não reutilizar em novas funções.';

-- -----------------------------------------------------------------------------
-- Permissões
-- Acesso exclusivo via service_role (chamada interna das edge functions).
-- Não expor a authenticated — ML-008 compliance.
-- ops.fn_evo_url_v2 e ops.fn_evo_key_v2: service_role apenas (sem GRANT explícito
-- porque service_role tem EXECUTE em todas as funções por padrão no Supabase).
-- -----------------------------------------------------------------------------

-- Nenhum GRANT EXECUTE TO authenticated nestas funções SECURITY DEFINER.
-- Ver: docs/decouple/ADR-013-PHASE1-PLAN.md E17, critério ML-008.
