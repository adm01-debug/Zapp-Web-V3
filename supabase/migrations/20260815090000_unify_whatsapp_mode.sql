-- =============================================================================
-- W7 — UNIFICAÇÃO DO MODO WHATSAPP (global_settings ↔ whatsapp_connections)
-- Destino no repo: supabase/migrations/20260815090000_unify_whatsapp_mode.sql
-- =============================================================================
-- CONTEXTO (simulação work-cloud-sim, 2026-08-15):
--   Existiam 2 fontes de verdade de "modo" DESALINHADAS:
--     1. zapp.global_settings (chave 'whatsapp_mode') lida via RPC
--        rpc_get_whatsapp_mode — DB-only, drift (não versionada);
--     2. whatsapp_connections.api_type — per-connection (official/unofficial).
--   O toggle admin só mudava a global; as edges não tinham modo.
--
-- ESTA MIGRATION (mirror DB→repo, idempotente):
--   (a) public.rpc_get_whatsapp_mode()        — leitura com DEFAULT 'unofficial'
--       e VALIDAÇÃO do valor (unofficial|official|cloud; inválido → RAISE).
--   (b) public.rpc_set_whatsapp_mode(p_mode)  — escrita transacional: valida,
--       atualiza global_settings E SINCRONIZA whatsapp_connections.api_type
--       (UPDATE ... WHERE api_type IS DISTINCT FROM p_mode).
--   (c) zapp.vw_whatsapp_mode                 — view de monitoramento (1 linha).
--
-- SEMÂNTICA DO MODO UNIFICADO:
--   unofficial → Evolution API (Baileys)         [default]
--   official   → WhatsApp Cloud API (Meta)
--   cloud      → WhatsApp Cloud API (Meta)      [novo modo explícito cloud-first]
--   A camada de edges (supabase/functions/_shared/mode.ts) resolve o envio:
--   grupo (@g.us) → SEMPRE evolution; 1:1 → modo global.
--
-- NOTA DE INTERAÇÃO: o trigger trg_validate_whatsapp_connection_url
-- (zapp.fn_validate_whatsapp_connection_url, fail-open) trata api_type='official'
-- como isento da checagem de URL; api_type='cloud' cai no caminho leniente
-- (RAISE WARNING, nunca bloqueia escrita) — comportamento aceitável e
-- documentado no RPC_AUDIT_V4.
--
-- SEGURANÇA:
--   - SECURITY DEFINER: executa com privilégios do proprietário
--   - SET search_path: restrito a zapp, evo, public, pg_catalog (sem escalada)
--   - rpc_set exige zapp.is_admin_or_supervisor(auth.uid()) (mesma semântica
--     da zapp.rpc_set_whatsapp_mode existente)
--   - REVOKE/GRANT explícitos: sem EXECUTE para PUBLIC/anon
--
-- ROLLBACK:
--   DROP FUNCTION public.rpc_get_whatsapp_mode();
--   DROP FUNCTION public.rpc_set_whatsapp_mode(text);
--   DROP VIEW zapp.vw_whatsapp_mode;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (a) public.rpc_get_whatsapp_mode() — leitura canônica do modo global
-- -----------------------------------------------------------------------------
-- Lê zapp.global_settings chave 'whatsapp_mode'; ausente → DEFAULT 'unofficial'.
-- Valor fora de (unofficial|official|cloud) → RAISE EXCEPTION (fail-closed:
-- modo corrompido no banco NUNCA é silenciosamente aceito pelo cliente).
CREATE OR REPLACE FUNCTION public.rpc_get_whatsapp_mode()
RETURNS text
LANGUAGE plpgsql SET search_path = zapp, evo, public, pg_catalog SECURITY DEFINER
AS $$
DECLARE
  v_mode text;
BEGIN
  SELECT value INTO v_mode
  FROM zapp.global_settings
  WHERE key = 'whatsapp_mode'
  LIMIT 1;

  v_mode := COALESCE(v_mode, 'unofficial');

  IF v_mode NOT IN ('unofficial', 'official', 'cloud') THEN
    RAISE EXCEPTION 'invalid whatsapp_mode value: % (allowed: unofficial, official, cloud)', v_mode;
  END IF;

  RETURN v_mode;
END;
$$;

COMMENT ON FUNCTION public.rpc_get_whatsapp_mode() IS
  'Modo WhatsApp global (fonte: zapp.global_settings chave whatsapp_mode). '
  'Default ''unofficial'' quando ausente; valida (unofficial|official|cloud) e '
  'lança exceção em valor inválido. definidor de seguranca com search_path restrito '
  '(zapp,evo,public,pg_catalog). Espelha a RPC DB-only rpc_get_whatsapp_mode '
  '(drift) e adiciona o modo cloud. Unificação W7 (2026-08-15).';

REVOKE ALL ON FUNCTION public.rpc_get_whatsapp_mode() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_whatsapp_mode() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_whatsapp_mode() TO service_role, authenticated;

-- -----------------------------------------------------------------------------
-- (b) public.rpc_set_whatsapp_mode(p_mode text) — escrita transacional + sync
-- -----------------------------------------------------------------------------
-- 1. Guarda de acesso: somente admin/supervisor (mesma regra da versão zapp).
-- 2. Valida p_mode (guard explícito contra NULL — achado A3 2026-08-05:
--    `NULL NOT IN (...)` = NULL → IF NULL = FALSE → bypass).
-- 3. UPSERT em zapp.global_settings ('whatsapp_mode', p_mode, updated_by).
-- 4. SINCRONIZA whatsapp_connections.api_type = p_mode em todas as conexões
--    divergentes (IS DISTINCT FROM cobre NULL→valor).
-- Tudo numa única função plpgsql = transação única: qualquer falha (ex.:
-- constraint em whatsapp_connections) desfaz o upsert da global — as duas
-- fontes de verdade nunca ficam parcialmente atualizadas.
CREATE OR REPLACE FUNCTION public.rpc_set_whatsapp_mode(p_mode text)
RETURNS text
LANGUAGE plpgsql SET search_path = zapp, evo, public, pg_catalog SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT zapp.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin/supervisor can change whatsapp_mode';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('unofficial', 'official', 'cloud') THEN
    RAISE EXCEPTION 'invalid mode: % (allowed: unofficial, official, cloud)', p_mode;
  END IF;

  INSERT INTO zapp.global_settings (key, value, updated_by)
  VALUES ('whatsapp_mode', p_mode, v_uid)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  UPDATE zapp.whatsapp_connections
  SET api_type = p_mode
  WHERE api_type IS DISTINCT FROM p_mode;

  RETURN p_mode;
END;
$$;

COMMENT ON FUNCTION public.rpc_set_whatsapp_mode(text) IS
  'Define o modo WhatsApp global (zapp.global_settings whatsapp_mode) e '
  'SINCRONIZA whatsapp_connections.api_type de todas as conexões divergentes '
  '(UPDATE WHERE api_type IS DISTINCT FROM p_mode) — transacional (1 função = '
  '1 transação). Valores: unofficial|official|cloud. Somente admin/supervisor. '
  'Unificação W7 (2026-08-15).';

REVOKE ALL ON FUNCTION public.rpc_set_whatsapp_mode(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_set_whatsapp_mode(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_whatsapp_mode(text) TO service_role, authenticated;

-- -----------------------------------------------------------------------------
-- (c) zapp.vw_whatsapp_mode — view de monitoramento (sempre 1 linha)
-- -----------------------------------------------------------------------------
-- mode: valor atual; 'unofficial' quando a chave nunca foi gravada.
-- updated_at: timestamp da última escrita; NULL enquanto a chave não existir
-- (sinal honesto de "nunca configurado" para o monitoramento).
-- security_invoker = true: RLS de zapp.global_settings aplicada ao chamador.
CREATE OR REPLACE VIEW zapp.vw_whatsapp_mode
WITH (security_invoker = true) AS
SELECT
  COALESCE(
    (SELECT value FROM zapp.global_settings WHERE key = 'whatsapp_mode' LIMIT 1),
    'unofficial'
  ) AS mode,
  (SELECT updated_at FROM zapp.global_settings WHERE key = 'whatsapp_mode' LIMIT 1) AS updated_at;

COMMENT ON VIEW zapp.vw_whatsapp_mode IS
  'Monitoramento do modo WhatsApp unificado (W7): 1 linha com mode atual '
  '(default ''unofficial'') e updated_at da última mudança. Fonte: '
  'zapp.global_settings chave whatsapp_mode.';

GRANT SELECT ON zapp.vw_whatsapp_mode TO authenticated, service_role;
