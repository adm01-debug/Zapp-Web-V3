-- ============================================================================
-- Migration: integration_schema_zapp_fixes
-- Data:      2026-08-04
-- Objetivo:  Fixes de integração do schema zapp (findings F-01, F-02, F-03,
--            F-06, H-01 da auditoria de integração schema zapp).
--
-- ESCOPO:     APENAS o banco de PRODUÇÃO (self-hosted, schema zapp completo).
--             Este repositório NÃO contém o schema base (zapp.user_roles,
--             zapp.roles, zapp.evolution_audit_log, fn_safe_audit_log,
--             fn_increment_meme_use, fn_toggle_user_meme_favorite etc. foram
--             criados no banco live por migrações perdidas). Por isso alguns
--             grants são guardados com to_regprocedure() para não abortar a
--             migration em ambiente fresco (idempotente).
--
-- NÃO APLICAR EM AMBIENTE SEM O SCHEMA BASE — validar antes:
--   SELECT to_regprocedure('zapp.fn_safe_audit_log(text,text,uuid,text,text,jsonb,jsonb,jsonb,text)');
--   SELECT to_regprocedure('zapp.fn_increment_meme_use(uuid)');
-- ============================================================================


-- ============================================================================
-- F-01 / F-02: Wrappers zapp para RPCs públicas (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- As funções public.rpc_app_bootstrap() e public.rpc_dashboard_init() são
-- SECURITY DEFINER hoje e estão concedidas a authenticated via public.
-- Estratégia: criar wrappers no schema zapp (SECURITY DEFINER, NÃO INVOKER)
-- que delegam para as originais em public, e REVOGAR authenticated das
-- originais — public.* passa a ser usado apenas por service_role; o front
-- passa a chamar zapp.rpc_app_bootstrap / zapp.rpc_dashboard_init.
-- O wrapper roda como owner (postgres) e por isso continua conseguindo
-- executar as originais mesmo após o REVOKE de authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_app_bootstrap()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public, pg_temp
AS $$ SELECT public.rpc_app_bootstrap() $$;

REVOKE ALL ON FUNCTION zapp.rpc_app_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_app_bootstrap() TO authenticated;

CREATE OR REPLACE FUNCTION zapp.rpc_dashboard_init(
  p_agent_id uuid,
  p_queue_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public, pg_temp
AS $$ SELECT public.rpc_dashboard_init(p_agent_id, p_queue_id, p_date_from, p_date_to) $$;

REVOKE ALL ON FUNCTION zapp.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) TO authenticated;

-- ----------------------------------------------------------------------------
-- F-01/F-02 (continuação): REVOKE das originais em public para authenticated.
-- public.rpc_app_bootstrap / public.rpc_dashboard_init ficam disponíveis
-- apenas para service_role (e owner). O front DEVE usar os wrappers zapp.*.
-- Observação: o GRANT a service_role dessas funções em public vem dos
-- default privileges do bootstrap do Supabase (não é removido por este REVOKE).
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.rpc_app_bootstrap() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- F-03: Grants de EXECUTE para funções do schema zapp usadas pelo front
-- ----------------------------------------------------------------------------
-- Auditoria: chamadas via supabase.rpc() de src/ falhavam com
-- "permission denied for function zapp.*" — faltavam grants a authenticated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F-03 (audit): zapp.fn_increment_meme_use(p_meme_id uuid) — uso de meme
-- (src/hooks/useAudioManagement.ts). Função NÃO definida neste repositório
-- (existe apenas no banco live) → grant condicional via to_regprocedure().
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('zapp.fn_increment_meme_use(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION zapp.fn_increment_meme_use(uuid) TO authenticated';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- F-03 (audit): zapp.fn_toggle_user_meme_favorite — 1º overload (favoritar
-- meme do próprio usuário). Função NÃO definida neste repositório → grant
-- condicional.
-- ATENÇÃO: o 2º overload (p_user_id uuid, p_meme_id uuid) NÃO é grantado:
-- não possui guard interno (aceita p_user_id arbitrário = favoritar como
-- outro usuário). Decisão de segurança documentada em
-- docs/simulation/20260804_rollback_plan.md (GAP-H).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('zapp.fn_toggle_user_meme_favorite(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid) TO authenticated';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- F-03 (audit): zapp.import_user_data(p_data jsonb) — STUB (no repo: RAISE
-- EXCEPTION 'not yet implemented'; versão live pode retornar
-- {imported:false,error:'not yet implemented'}). Grant inofensivo — a função
-- não executa nada perigoso; necessária para o front não quebrar na chamada.
-- Re-grant é idempotente (canonical já concede).
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION zapp.import_user_data(p_data jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- F-03 (audit): zapp.rpc_list_failed_messages — assinatura de 7 params usada
-- pelo front (fila de mensagens falhas). Re-grant idempotente (canonical já
-- concede; mantido por garantia caso PUBLIC tenha sido revogado depois).
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(
  p_status text[], p_instance text, p_search text,
  p_from timestamptz, p_to timestamptz, p_limit integer, p_offset integer
) TO authenticated;


-- ============================================================================
-- H-01 (GAP-H): Guard de segurança em zapp.fn_safe_audit_log
-- ----------------------------------------------------------------------------
-- RISCO P0: fn_safe_audit_log é SECURITY DEFINER SEM guard — qualquer usuário
-- authenticated poderia forjar entradas do audit log (action/entity/performed_by
-- arbitrários). Adicionamos guard antes do INSERT e SÓ ENTÃO concedemos o
-- grant a authenticated.
--
-- Guard usado: zapp.is_admin_or_supervisor() EXISTE no banco live (verificado
-- 2026-08-04 — 2 overloads: () e (uuid)); ele checa zapp.user_roles
-- (role::text IN dev/admin/manager/supervisor) + zapp.workspace_members.
--   * permitido: p_performed_by == auth.uid()::text (self por uid)
--   * permitido: p_performed_by == email do próprio usuário (auth.users) —
--     o caller do front (useConnectionsManager.ts) envia user.email, não o uid
--   * permitido: role admin/supervisor (via zapp.is_admin_or_supervisor())
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_safe_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL::uuid,
  p_performed_by text DEFAULT 'system'::text,
  p_performed_by_type text DEFAULT 'system'::text,
  p_old jsonb DEFAULT NULL::jsonb,
  p_new jsonb DEFAULT NULL::jsonb,
  p_metadata jsonb DEFAULT NULL::jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_temp
AS $$
DECLARE
  v_id   uuid;
  v_meta jsonb;
BEGIN
  -- H-01: guard de segurança (SECURITY DEFINER sem guard = P0)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- NULL-safe: p_performed_by NULL não pode bypassar (IS DISTINCT FROM)
  IF p_performed_by IS NULL
     OR (p_performed_by IS DISTINCT FROM auth.uid()::text
         AND p_performed_by IS DISTINCT FROM COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), '')
         AND NOT zapp.is_admin_or_supervisor())
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- p_notes não é coluna garantida da tabela → merge no metadata
  v_meta := COALESCE(p_metadata, '{}'::jsonb);
  IF p_notes IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('notes', p_notes);
  END IF;

  BEGIN
    BEGIN
      INSERT INTO zapp.evolution_audit_log (
        action, entity_type, entity_id,
        performed_by, performed_by_type,
        old_values, new_values, metadata
      )
      VALUES (
        p_action, p_entity_type, p_entity_id,
        p_performed_by, p_performed_by_type,
        p_old, p_new, v_meta
      )
      RETURNING id INTO v_id;

      RETURN v_id;

    EXCEPTION WHEN check_violation THEN
      BEGIN
        -- Ação fora do vocabulário permitido (CHECK constraint) → fallback com
        -- action_not_in_vocabulary, preservando o contexto no metadata.
        INSERT INTO zapp.evolution_audit_log (
          action, entity_type, entity_id,
          performed_by, performed_by_type,
          old_values, new_values, metadata
        )
        VALUES (
          'action_not_in_vocabulary', p_entity_type, p_entity_id,
          p_performed_by, p_performed_by_type,
          p_old, p_new,
          v_meta || jsonb_build_object('original_action', p_action)
        )
        RETURNING id INTO v_id;

        RETURN v_id;
      EXCEPTION WHEN OTHERS THEN
        -- Robustez (preservado da versão original): qualquer erro no INSERT
        -- não derruba o chamador (log é best-effort).
        RAISE WARNING 'fn_safe_audit_log falhou: %', SQLERRM;
        RETURN NULL;
      END;
    END;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.fn_safe_audit_log(
  text, text, uuid, text, text, jsonb, jsonb, jsonb, text
) TO authenticated;

-- ML-005: função nova recebe EXECUTE p/ PUBLIC por default — revogar
REVOKE ALL ON FUNCTION zapp.fn_safe_audit_log(text, text, uuid, text, text, jsonb, jsonb, jsonb, text) FROM PUBLIC;


-- ============================================================================
-- F-06: RPCs de information_schema COM WHITELIST (evitar leak de metadados)
-- ----------------------------------------------------------------------------
-- O front consulta colunas/tabelas para gerar forms dinâmicos. Sem whitelist,
-- um SECURITY DEFINER sobre information_schema vazaria metadados de TODOS os
-- schemas (auth, net, storage, vault...). Whitelist: apenas zapp, evo, public.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_schema_columns(p_schema text DEFAULT 'zapp')
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, information_schema
AS $$
  -- RETURNS jsonb (array) em UMA linha: evita truncamento silencioso do
  -- max-rows do PostgREST (default 1000) com ~4800 colunas em zapp.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'table_name', t.table_name::text,
      'column_name', c.column_name::text,
      'data_type', c.data_type::text,
      'is_nullable', c.is_nullable::text
    )
    ORDER BY t.table_name, c.ordinal_position
  ), '[]'::jsonb)
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = p_schema
    AND p_schema IN ('zapp','evo','public')
$$;

REVOKE ALL ON FUNCTION zapp.rpc_schema_columns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_schema_columns(text) TO authenticated;

CREATE OR REPLACE FUNCTION zapp.rpc_schema_tables(p_schema text DEFAULT 'zapp')
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, information_schema
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'table_name', table_name::text,
      'table_type', table_type::text
    )
    ORDER BY table_name
  ), '[]'::jsonb)
  FROM information_schema.tables
  WHERE table_schema = p_schema
    AND p_schema IN ('zapp','evo','public')
$$;

REVOKE ALL ON FUNCTION zapp.rpc_schema_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_schema_tables(text) TO authenticated;


-- ============================================================================
-- F-04 (credenciais): RPCs SECURITY DEFINER para escrita de credenciais
-- ----------------------------------------------------------------------------
-- A edge function evolution-credentials (POST save/delete) escreve via RPC
-- porque evo.evolution_instance_credentials é service_role only (RLS) e o
-- schema evo NÃO está no PGRST_DB_SCHEMAS. Mesmo padrão do GET
-- (fn_edge_get_evolution_credentials, que vive em zapp).
-- EXECUTE: SOMENTE service_role (nunca authenticated/anon). search_path=''
-- com referências qualificadas (padrão de segurança do projeto).
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_edge_upsert_evolution_credentials(
  p_instance_name text,
  p_api_url text,
  p_api_key text,
  p_display_name text,
  p_department text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Guarda: apenas service_role (defesa em profundidade — o GRANT já restringe)
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO evo.evolution_instance_credentials (
    instance_name, api_url, api_key, display_name, department, is_active, updated_at
  )
  VALUES (
    p_instance_name, p_api_url, p_api_key, p_display_name, p_department,
    COALESCE(p_is_active, true), now()
  )
  ON CONFLICT (instance_name) DO UPDATE SET
    api_url      = EXCLUDED.api_url,
    api_key      = EXCLUDED.api_key,
    display_name = EXCLUDED.display_name,
    department   = EXCLUDED.department,
    is_active    = EXCLUDED.is_active,
    updated_at   = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id::text);
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_edge_upsert_evolution_credentials(text,text,text,text,text,boolean) FROM PUBLIC;
-- Default privileges do Supabase concedem EXECUTE a authenticated/anon em função
-- nova — revogar explicitamente (ACL final: postgres + service_role apenas).
REVOKE EXECUTE ON FUNCTION zapp.fn_edge_upsert_evolution_credentials(text,text,text,text,text,boolean) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_edge_upsert_evolution_credentials(text,text,text,text,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION zapp.fn_edge_delete_evolution_credentials(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM evo.evolution_instance_credentials WHERE id = p_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_edge_delete_evolution_credentials(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.fn_edge_delete_evolution_credentials(uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_edge_delete_evolution_credentials(uuid) TO service_role;


-- ============================================================================
-- H-01 (audit linters): comentário documental na tabela de backup
-- ----------------------------------------------------------------------------
-- zapp._backup_avatar_urls_20260803: RLS habilitada SEM policy = deny-all.
-- Isso é INTENCIONAL (tabela de backup, acesso só via service_role/owner) —
-- o comentário silencia linters de RLS que acusam "table has RLS but no
-- policy". Idempotente: se a tabela não existir, não falha.
-- ============================================================================

DO $$
BEGIN
  COMMENT ON TABLE zapp._backup_avatar_urls_20260803
    IS 'Backup 2026-08-03. RLS on sem policy = deny-all intencional (linters)';
EXCEPTION WHEN undefined_table THEN
  NULL; -- tabela não existe neste ambiente: comentário é opcional
END
$$;


-- ============================================================================
-- Final: recarregar o schema cache do PostgREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';
