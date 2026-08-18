-- =============================================================================
-- Contrato N8n — zapp.n8n_config (integração REAL, desligada por padrão)
-- =============================================================================
-- Etapa 72 (stubs de integração): a UI N8n era um stub com setIsConnected local
-- (nenhuma ação persistia — usuário enganado). Este contrato torna a integração
-- REAL e HONESTA:
--   - Tabela single-row zapp.n8n_config (id = 1): base_url + webhook_secret
--     (futuro HMAC) + enabled (default FALSE = contrato desligado; nenhum
--     evento é enviado ao n8n até o pipeline de dispatch existir).
--   - RPCs fn_edge_get_n8n_config / fn_edge_upsert_n8n_config: acesso da edge
--     function zapp-n8n-sync (service_role). NUNCA expõem webhook_secret.
--   - RLS: SELECT apenas admin/supervisor (autenticado); escrita somente
--     service_role (via edge function). Nenhum acesso anon/public.
--
-- Aplicação: migration versionada (espelho repo×DB). Sem DDL solto em prod.
-- Rollback:
--   DROP TABLE zapp.n8n_config;
--   DROP FUNCTION zapp.fn_edge_get_n8n_config();
--   DROP FUNCTION zapp.fn_edge_upsert_n8n_config(text, boolean);
-- =============================================================================

CREATE TABLE IF NOT EXISTS zapp.n8n_config (
  id             integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single-row: id fixo 1
  base_url       text,                                             -- URL base da instância n8n (NULL = não configurada)
  webhook_secret text,                                             -- secret p/ validação HMAC de webhooks (futuro) — nunca exposto
  enabled        boolean     NOT NULL DEFAULT false,               -- false = integração desligada
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  zapp.n8n_config IS 'Configuração da integração n8n (single-row, id=1). Contrato real desligado: enabled=false até o pipeline de dispatch existir.';
COMMENT ON COLUMN zapp.n8n_config.webhook_secret IS 'Segredo para validação HMAC de webhooks n8n. NUNCA exposto via RPC/view/edge.';

-- updated_at automático (trigger genérico da casa)
DROP TRIGGER IF EXISTS trg_n8n_config_touch ON zapp.n8n_config;
CREATE TRIGGER trg_n8n_config_touch
  BEFORE UPDATE ON zapp.n8n_config
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — leitura admin/supervisor (autenticado); escrita somente service_role
-- ---------------------------------------------------------------------------
ALTER TABLE zapp.n8n_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_secure_n8n_config_select" ON zapp.n8n_config;
CREATE POLICY auth_secure_n8n_config_select ON zapp.n8n_config
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "service_role_all" ON zapp.n8n_config;
CREATE POLICY service_role_all ON zapp.n8n_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- RPCs da edge function zapp-n8n-sync (SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_edge_get_n8n_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $fn$
DECLARE
  v_row zapp.n8n_config%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM zapp.n8n_config WHERE id = 1;
  IF NOT FOUND THEN
    RETURN NULL; -- sem linha = integração não configurada (estado honesto)
  END IF;
  -- NUNCA incluir webhook_secret na resposta
  RETURN jsonb_build_object(
    'id',         v_row.id,
    'base_url',   v_row.base_url,
    'enabled',    v_row.enabled,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION zapp.fn_edge_upsert_n8n_config(
  p_base_url text,
  p_enabled  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $fn$
DECLARE
  v_row zapp.n8n_config%ROWTYPE;
BEGIN
  INSERT INTO zapp.n8n_config (id, base_url, enabled, updated_by)
  VALUES (1, p_base_url, p_enabled, auth.uid())
  ON CONFLICT (id) DO UPDATE
     SET base_url   = EXCLUDED.base_url,
         enabled    = EXCLUDED.enabled,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',         v_row.id,
    'base_url',   v_row.base_url,
    'enabled',    v_row.enabled,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$fn$;

-- Grants: revogar a default ACL (authenticated recebe EXECUTE por default nos
-- schemas zapp/evo — ver 20260811160000_revoke_auth_exec_fns_novas.sql).
REVOKE ALL ON FUNCTION zapp.fn_edge_get_n8n_config() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.fn_edge_get_n8n_config() FROM authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_edge_get_n8n_config() TO service_role;

REVOKE ALL ON FUNCTION zapp.fn_edge_upsert_n8n_config(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.fn_edge_upsert_n8n_config(text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_edge_upsert_n8n_config(text, boolean) TO service_role;
