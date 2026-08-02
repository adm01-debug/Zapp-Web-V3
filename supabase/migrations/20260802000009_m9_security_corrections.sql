-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000009_m9_security_corrections.sql
-- Purpose  : Corrige falhas de segurança e lógica identificadas por revisão
--            da cubic-dev-ai nas migrações M-2 (20260802000002) e M-8.
--
-- Correções:
--   C1 — get_contact_360_by_phone: workspace isolation fail-open → fail-closed
--        Usuário autenticado sem linha em workspace_members via v_workspace_id=NULL
--        curto-circuitava o filtro (v_workspace_id IS NULL OR ...) e via TODOS
--        os contatos de TODOS os workspaces. Fix: retorno antecipado vazio.
--
--   C2 — fn_system_health_score: OR v>0 sem guarda de 'degraded'
--        v conta conexões com status='connected' AND is_active. Uma conexão
--        degradada ainda satisfaz essas condições → v>0 = TRUE → v_wpp2_ok=TRUE
--        → estado='connected'+'degraded' marcava 20/20 em vez de 8/20.
--        Fix: adiciona COALESCE(v_wpp2_health,'ok') != 'degraded' ao ramo OR v>0.
--
--   C3 — evo._evolution_contacts_backup_20260801: dependência cruzada evo→zapp
--        Policy admin_select chamava zapp.is_admin_or_supervisor() — schema evo
--        NUNCA deve depender do schema zapp (viola regra de isolamento de schemas).
--        Fix: DROP da policy problemática. Service_role mantém acesso total (ALL).
--
--   C4 — evo._evolution_contacts_backup_20260801: garantir ENABLE ROW LEVEL SECURITY
--        antes das policies (idempotente — seguro se já habilitado).
--
-- Idempotência: seguro para re-aplicar.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- C1: get_contact_360_by_phone — fail-closed para authenticated sem workspace
-- service_role (auth.uid()=NULL) continua sem filtro de workspace (por design).
-- authenticated sem workspace_members row → retorna '{}' (vazio, fail-closed).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.get_contact_360_by_phone(p_phone TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = zapp AS $$
DECLARE
  v_contact      JSONB;
  v_uid          UUID := auth.uid();
  v_workspace_id UUID;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT wm.workspace_id INTO v_workspace_id
      FROM zapp.workspace_members wm
     WHERE wm.user_id = v_uid
     LIMIT 1;

    -- C1 FIX: authenticated mas sem workspace_members row → fail-closed (empty)
    -- Impede exposição cross-tenant via v_workspace_id IS NULL curto-circuito.
    IF v_workspace_id IS NULL THEN
      RETURN '{}'::jsonb;
    END IF;
  END IF;

  SELECT jsonb_build_object(
      'id',                  c.id,
      'name',                c.name,
      'phone',               c.phone,
      'email',               c.email,
      'tags',                c.tags,
      'notes',               c.notes,
      'created_at',          c.created_at,
      'conversations_count', 0
    )
    INTO v_contact
    FROM zapp.contacts c
   WHERE (c.phone = p_phone
          OR REPLACE(REPLACE(c.phone,'+',''),'-','')
             = REPLACE(REPLACE(p_phone,'+',''),'-',''))
     AND (v_uid IS NULL OR c.workspace_id = v_workspace_id)
   ORDER BY c.created_at DESC
   LIMIT 1;

  RETURN COALESCE(v_contact, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_contact_360_by_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_contact_360_by_phone(TEXT) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- C2: fn_system_health_score — adiciona guarda de 'degraded' ao ramo OR v>0
-- Usa replace() sobre prosrc para evitar re-embutir a função de ~220 linhas.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src   TEXT;
  v_fixed TEXT;
  v_old   TEXT := 'OR v>0';
  v_new   TEXT := 'OR (v>0 AND COALESCE(v_wpp2_health,''ok'') != ''degraded'')';
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_catalog.pg_proc
   WHERE proname = 'fn_system_health_score'
     AND pronamespace = 'zapp'::regnamespace;

  IF NOT FOUND OR v_src IS NULL THEN
    RAISE NOTICE 'M-9 C2: fn_system_health_score não encontrada — ignorando';
    RETURN;
  END IF;

  -- Verificar se o ramo já foi corrigido
  IF v_src LIKE '%OR (v>0 AND COALESCE(v_wpp2_health%' THEN
    RAISE NOTICE 'M-9 C2: fn_system_health_score já possui guarda de degraded — no-op';
    RETURN;
  END IF;

  v_fixed := replace(v_src, v_old, v_new);

  IF v_fixed = v_src THEN
    RAISE EXCEPTION 'M-9 C2: padrão "OR v>0" não encontrado em fn_system_health_score — correção manual necessária'
      USING ERRCODE = 'P0001';
  END IF;

  -- Rebuild: attributes (RETURNS, LANGUAGE, SET) são preservados do catálogo
  EXECUTE format(
    $ddl$
    CREATE OR REPLACE FUNCTION zapp.fn_system_health_score()
     RETURNS jsonb
     LANGUAGE plpgsql
     SET search_path TO 'public', 'evo', 'zapp', 'ops', 'cron', 'pg_catalog'
    AS $fn$%s$fn$
    $ddl$,
    v_fixed
  );

  RAISE NOTICE 'M-9 C2: fn_system_health_score — guarda OR v>0 aplicada com sucesso';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C3 + C4: evo._evolution_contacts_backup_20260801
-- C4: ENABLE ROW LEVEL SECURITY (idempotente)
-- C3: DROP da policy admin_select que referenciava zapp.is_admin_or_supervisor()
--     (dependência evo→zapp proibida). Service_role mantém acesso via service_role_all.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'evo'
       AND table_name   = '_evolution_contacts_backup_20260801'
  ) THEN
    RAISE NOTICE 'M-9 C3/C4: _evolution_contacts_backup_20260801 não encontrada — ignorando';
    RETURN;
  END IF;

  -- C4: garantir RLS habilitado (idempotente)
  EXECUTE 'ALTER TABLE evo._evolution_contacts_backup_20260801 ENABLE ROW LEVEL SECURITY';
  RAISE NOTICE 'M-9 C4: RLS habilitado na tabela de backup (idempotente)';

  -- C3: remover policy com dependência cruzada evo→zapp
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'evo'
       AND tablename  = '_evolution_contacts_backup_20260801'
       AND policyname = 'admin_select'
  ) THEN
    EXECUTE 'DROP POLICY admin_select ON evo._evolution_contacts_backup_20260801';
    RAISE NOTICE 'M-9 C3: admin_select (evo→zapp dependency) removida';
  ELSE
    RAISE NOTICE 'M-9 C3: admin_select não existe — skip';
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'M-9 C3/C4: ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação pós-aplicação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src TEXT;
BEGIN
  -- C1: confirmar que get_contact_360_by_phone não contém mais o padrão fail-open
  SELECT prosrc INTO v_src
    FROM pg_catalog.pg_proc
   WHERE proname = 'get_contact_360_by_phone'
     AND pronamespace = 'zapp'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'M-9 VER: get_contact_360_by_phone não encontrada (CI env?) — skip';
  ELSIF v_src LIKE '%v_workspace_id IS NULL OR%' THEN
    RAISE EXCEPTION 'M-9 VER FAILED C1: get_contact_360_by_phone ainda contém padrão fail-open'
      USING ERRCODE = 'P0001';
  ELSE
    RAISE NOTICE 'M-9 VER C1: get_contact_360_by_phone — fail-closed confirmado ✓';
  END IF;

  -- C2: confirmar que fn_system_health_score tem a guarda de degraded
  SELECT prosrc INTO v_src
    FROM pg_catalog.pg_proc
   WHERE proname = 'fn_system_health_score'
     AND pronamespace = 'zapp'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'M-9 VER: fn_system_health_score não encontrada (CI env?) — skip';
  ELSIF v_src LIKE '%OR v>0%' AND v_src NOT LIKE '%OR (v>0 AND COALESCE%' THEN
    RAISE EXCEPTION 'M-9 VER FAILED C2: fn_system_health_score ainda contém OR v>0 sem guarda'
      USING ERRCODE = 'P0001';
  ELSE
    RAISE NOTICE 'M-9 VER C2: fn_system_health_score — guarda de degraded confirmada ✓';
  END IF;

  -- C3: confirmar que policy admin_select não existe mais
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'evo'
       AND tablename  = '_evolution_contacts_backup_20260801'
       AND policyname = 'admin_select'
  ) THEN
    RAISE EXCEPTION 'M-9 VER FAILED C3: admin_select ainda existe em evo backup table'
      USING ERRCODE = 'P0001';
  ELSE
    RAISE NOTICE 'M-9 VER C3: admin_select removida (evo→zapp dependency) ✓';
  END IF;

  RAISE NOTICE 'M-9: Todas as verificações passaram ✓';
END $$;
