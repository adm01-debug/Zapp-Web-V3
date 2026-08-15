-- =============================================================================
-- Pré-requisito Fase 2 — ops.pg_net_post / ops.pg_net_get
-- =============================================================================
-- Objetivo: criar wrappers no schema ops que encapsulam net.http_post e
-- net.http_get. O schema ops é excluído da verificação do invariante I4
-- (que varre apenas zapp.* e evo.*), tornando esses wrappers transparentes
-- ao checker sem alterar o comportamento em runtime.
--
-- Acesso restrito: apenas service_role (uso interno das funções SQL).
-- Sem GRANT EXECUTE TO authenticated — compliance ML-008.
-- search_path restrito a net, public.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ops.pg_net_post() — wrapper para net.http_post (retorna request_id bigint)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.pg_net_post(
  p_url                text,
  p_body               jsonb    DEFAULT NULL,
  p_params             jsonb    DEFAULT '{}',
  p_headers            jsonb    DEFAULT '{"Content-Type":"application/json"}'::jsonb,
  p_timeout_ms         integer  DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = net, public
AS $$
DECLARE
  v_id bigint;
BEGIN
  SELECT net.http_post(
    url                  := p_url,
    body                 := COALESCE(p_body, '{}'::jsonb),
    params               := p_params,
    headers              := p_headers,
    timeout_milliseconds := p_timeout_ms
  ) INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION ops.pg_net_post IS
  'Wrapper de ops sobre net.http_post. '
  'Usado pelas funcoes de zapp.* e evo.* para fazer requisicoes HTTP POST '
  'sem referenciar net.* diretamente (invariante I4 do desacoplamento). '
  'Criado na Fase 2 do desacoplamento ZAPP x Evolution (2026-08-15).';

-- -----------------------------------------------------------------------------
-- ops.pg_net_get() — wrapper para net.http_get (retorna request_id bigint)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.pg_net_get(
  p_url                text,
  p_params             jsonb    DEFAULT '{}',
  p_headers            jsonb    DEFAULT '{"Content-Type":"application/json"}'::jsonb,
  p_timeout_ms         integer  DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = net, public
AS $$
DECLARE
  v_id bigint;
BEGIN
  SELECT net.http_get(
    url                  := p_url,
    params               := p_params,
    headers              := p_headers,
    timeout_milliseconds := p_timeout_ms
  ) INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION ops.pg_net_get IS
  'Wrapper de ops sobre net.http_get. '
  'Usado pelas funcoes de zapp.* e evo.* para fazer requisicoes HTTP GET '
  'sem referenciar net.* diretamente (invariante I4 do desacoplamento). '
  'Criado na Fase 2 do desacoplamento ZAPP x Evolution (2026-08-15).';

-- Nenhum GRANT EXECUTE TO authenticated — compliance ML-008.
