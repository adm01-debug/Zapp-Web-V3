-- =====================================================================================
-- RLS HARDENING — substitui políticas permissivas `USING (true)` / `WITH CHECK (true)`
-- =====================================================================================
--
-- ⚠️  ATENÇÃO — VALIDAR EM STAGING ANTES DE APLICAR EM PRODUÇÃO ⚠️
-- Esta migração ENDURECE o acesso. Como o modelo deste projeto é por-usuário
-- (`auth.uid() = <coluna de propriedade>`) + por-papel (`has_role`/admin/supervisor),
-- ela:
--   • Tabelas COM coluna de propriedade (user_id/created_by/agent_id/uploaded_by/owner_id):
--       acesso = dono OU admin OU supervisor (SELECT/INSERT/UPDATE/DELETE).
--   • Tabelas SEM coluna de propriedade (catálogos/config compartilhados):
--       LEITURA preservada para autenticados; ESCRITA restrita a admin/supervisor.
--
-- Abordagem segura e idempotente:
--   • Só atua em políticas cujo USING/WITH CHECK é LITERALMENTE `true` (lidas do catálogo
--     pg_policy no momento da aplicação) — não depende de nomes/estado hard-coded.
--   • Concede EXECUTE dos helpers que as políticas usam (has_role) para `authenticated`,
--     tornando a migração auto-suficiente mesmo que GRANTs anteriores tenham sido revogados.
--   • A política de leitura de catálogos usa `auth.uid() IS NOT NULL` (não `true`),
--     para não ser re-detectada/derrubada em reaplicações.
--
-- Rollback (manual, NÃO auto-aplicado): supabase/manual-rollbacks/20260529120100_harden_rls_DOWN.sql
-- =====================================================================================

-- 0. Garantir que as políticas conseguem chamar os helpers (evita lockout por GRANT revogado).
DO $$
BEGIN
  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated';
  END IF;
END $$;

-- 1. Reescrever as políticas permissivas.
DO $$
DECLARE
  t record;
  pol record;
  owner_col text;
  staff_pred constant text :=
    '(public.has_role(auth.uid(), ''admin''::public.app_role) '
    || 'OR public.has_role(auth.uid(), ''supervisor''::public.app_role))';
BEGIN
  FOR t IN
    SELECT DISTINCT c.relname AS table_name
    FROM pg_policy p
    JOIN pg_class c     ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND ( pg_get_expr(p.polqual, p.polrelid)      = 'true'
         OR pg_get_expr(p.polwithcheck, p.polrelid) = 'true' )
  LOOP
    -- 1a. Detectar a coluna de propriedade (na ordem de preferência).
    SELECT v.col INTO owner_col
    FROM (VALUES ('user_id'),('created_by'),('agent_id'),('uploaded_by'),('owner_id')) AS v(col)
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = t.table_name AND ic.column_name = v.col
    )
    ORDER BY array_position(ARRAY['user_id','created_by','agent_id','uploaded_by','owner_id'], v.col)
    LIMIT 1;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.table_name);

    -- 1b. Derrubar APENAS as políticas permissivas (true) desta tabela.
    FOR pol IN
      SELECT p.polname
      FROM pg_policy p
      WHERE p.polrelid = format('public.%I', t.table_name)::regclass
        AND ( pg_get_expr(p.polqual, p.polrelid)      = 'true'
           OR pg_get_expr(p.polwithcheck, p.polrelid) = 'true' )
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I;', pol.polname, t.table_name);
    END LOOP;

    -- 1c. Criar políticas endurecidas.
    IF owner_col IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %1$I_owner_access ON public.%1$I FOR ALL TO authenticated '
        || 'USING (%2$I = auth.uid() OR %3$s) WITH CHECK (%2$I = auth.uid() OR %3$s);',
        t.table_name, owner_col, staff_pred
      );
    ELSE
      -- Catálogo/config compartilhado: leitura para autenticados, escrita só admin/supervisor.
      EXECUTE format(
        'CREATE POLICY %1$I_auth_read ON public.%1$I FOR SELECT TO authenticated '
        || 'USING (auth.uid() IS NOT NULL);',
        t.table_name
      );
      EXECUTE format(
        'CREATE POLICY %1$I_staff_write ON public.%1$I FOR ALL TO authenticated '
        || 'USING (%2$s) WITH CHECK (%2$s);',
        t.table_name, staff_pred
      );
    END IF;

    RAISE NOTICE 'RLS endurecida: public.% (owner_col=%)', t.table_name, COALESCE(owner_col, '<none>');
  END LOOP;
END $$;
