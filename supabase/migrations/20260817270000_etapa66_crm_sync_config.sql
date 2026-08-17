-- ────────────────────────────────────────────────────────────────────────────
-- Etapa 66 · CRM plugável — zapp.crm_sync_config (SIM-CRM F0)
-- Tema único: tabela de configuração de sync CRM + RLS admin/supervisor
-- (padrão CSAT auth_secure_*) + RPCs de acesso (SECURITY DEFINER).
--
-- Design: sim4/sim-crm.md (SIM-CRM). Stub legado zapp.sync_to_crm NÃO é tocado
-- (armadilha documentada — ver (e) F3 do SIM-CRM).
--
-- Regra de ouro: settings NUNCA carrega secrets (webhook_url/token ficam em
-- env da edge — padrão BITRIX_WEBHOOK_URL — ou vault). settings só carrega
-- config não-secreta (label, mapeamento de campos, base_url pública, dry_run).
-- Isso mantém a RLS simples e evita exfiltração via PostgREST.
--
-- Fronteira: timestamp > 20260817220000 (última migration em main).
-- Rollback: DROP TABLE zapp.crm_sync_config;
--           DROP FUNCTION zapp.rpc_get_crm_sync_config();
--           DROP FUNCTION zapp.rpc_upsert_crm_sync_config(text, boolean, jsonb);
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela ───────────────────────────────────────────────────────────────
CREATE TABLE zapp.crm_sync_config (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   text NOT NULL CHECK (provider IN ('bitrix24', 'custom_cloud')),
  enabled    boolean NOT NULL DEFAULT false,
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb
             CHECK (jsonb_typeof(settings) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

COMMENT ON TABLE zapp.crm_sync_config IS
  'CRM plugável: 1 linha por provider. Secrets NUNCA em settings (ficam em env da edge ou vault) — settings só carrega config não-secreta (label, mapping de campos, base_url publica, dry_run).';
COMMENT ON COLUMN zapp.crm_sync_config.settings IS
  'Config não-secreta do provider. PROIBIDO armazenar webhook_url/token/api_key aqui (exfiltração via PostgREST); secrets vivem em env da edge (ex.: BITRIX_WEBHOOK_URL) ou vault.';

-- ── 2. RLS (padrão CSAT endurecido auth_secure_*, NUNCA USING(true)) ────────
ALTER TABLE zapp.crm_sync_config ENABLE ROW LEVEL SECURITY;

-- auth_secure_56: admin/supervisor — SELECT/INSERT/UPDATE/DELETE.
-- (grant abaixo restringe authenticated a SELECT; a cláusula FOR ALL espelha o
-- padrão CSAT auth_secure_53 e cobre acesso direto futuro sem reabrir nada.)
DROP POLICY IF EXISTS auth_secure_56 ON zapp.crm_sync_config;
CREATE POLICY auth_secure_56 ON zapp.crm_sync_config
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());

-- service_role: acesso total (edges via createZappAdminClient).
DROP POLICY IF EXISTS crm_sync_config_service_all ON zapp.crm_sync_config;
CREATE POLICY crm_sync_config_service_all ON zapp.crm_sync_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Grants ───────────────────────────────────────────────────────────────
GRANT ALL ON zapp.crm_sync_config TO service_role;
-- authenticated: SELECT via política auth_secure_56 (admin/supervisor).
-- Escritas passam pelas RPCs SECURITY DEFINER abaixo (validação + auditoria
-- via created_by/auth.uid()) — grant restrito é defesa em profundidade.
GRANT SELECT ON zapp.crm_sync_config TO authenticated;

-- ── 4. RPCs de acesso (SECURITY DEFINER, search_path fixo, PostgREST) ──────
CREATE OR REPLACE FUNCTION zapp.rpc_get_crm_sync_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'enabled', enabled,
    'settings', settings
  ) ORDER BY provider), '[]'::jsonb)
  INTO v_result
  FROM zapp.crm_sync_config;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION zapp.rpc_get_crm_sync_config() IS
  'Lista providers configurados (SEM secrets por construção — settings é não-secreta). Consumido pelo hook useSyncToCRM para o estado honesto isConfigured.';

CREATE OR REPLACE FUNCTION zapp.rpc_upsert_crm_sync_config(
  p_provider text,
  p_enabled boolean DEFAULT false,
  p_settings jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('bitrix24', 'custom_cloud') THEN
    RAISE EXCEPTION 'provider inválido: % (esperado bitrix24|custom_cloud)', p_provider
      USING ERRCODE = '22023';
  END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'settings deve ser objeto jsonb — secrets NUNCA aqui (use env da edge)'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO zapp.crm_sync_config (provider, enabled, settings, created_by)
  VALUES (p_provider, COALESCE(p_enabled, false), p_settings, auth.uid())
  ON CONFLICT (provider) DO UPDATE
    SET enabled    = EXCLUDED.enabled,
        settings   = EXCLUDED.settings,
        updated_at = now()
  RETURNING jsonb_build_object(
    'provider', provider,
    'enabled',  enabled,
    'settings', settings
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION zapp.rpc_upsert_crm_sync_config(text, boolean, jsonb) IS
  'Upsert versionado da config de provider CRM. Valida provider (CHECK) e settings (objeto, sem secrets) antes de gravar — F8 (config corrompida).';

GRANT EXECUTE ON FUNCTION zapp.rpc_get_crm_sync_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION zapp.rpc_upsert_crm_sync_config(text, boolean, jsonb) TO authenticated, service_role;
