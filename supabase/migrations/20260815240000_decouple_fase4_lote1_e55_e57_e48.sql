-- FASE 4 lote 1 — PLANO_INDEPENDENCIA_100_ETAPAS_20260815
-- E55-E57: move as 3 funções de negócio evo -> zapp (triggers seguem por OID)
-- E48 (parcial): remove 'evo' do search_path de funções zapp que não mencionam objetos evo
-- Aplicado em produção via MCP em 2026-08-15 (registrado em supabase_migrations como 20260815240000).
-- Idempotente: só move o que ainda reside em evo.

CREATE OR REPLACE FUNCTION zapp.fn_uuid_safe(t text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = zapp AS $$
  SELECT CASE WHEN t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN t::uuid END
$$;

DO $$
BEGIN
  IF to_regprocedure('evo.fn_auto_assign_contact()') IS NOT NULL THEN
    ALTER FUNCTION evo.fn_auto_assign_contact() SET SCHEMA zapp;
  END IF;
  IF to_regprocedure('evo.fn_log_assignment_change()') IS NOT NULL THEN
    ALTER FUNCTION evo.fn_log_assignment_change() SET SCHEMA zapp;
  END IF;
  IF to_regprocedure('evo.sync_contact_intelligence()') IS NOT NULL THEN
    ALTER FUNCTION evo.sync_contact_intelligence() SET SCHEMA zapp;
  END IF;
END $$;

ALTER FUNCTION zapp.fn_auto_assign_contact() SET search_path = zapp;
ALTER FUNCTION zapp.sync_contact_intelligence() SET search_path = zapp;

CREATE OR REPLACE FUNCTION zapp.fn_log_assignment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp AS $$
BEGIN
  BEGIN
    PERFORM zapp.rpc_log_assignment_change(
      NEW.id,
      zapp.fn_uuid_safe(OLD.assigned_to),
      zapp.fn_uuid_safe(NEW.assigned_to),
      CASE WHEN OLD.assigned_to IS NULL THEN 'assign'
           WHEN NEW.assigned_to IS NULL THEN 'unassign'
           ELSE 'transfer' END,
      COALESCE(zapp.fn_uuid_safe(NEW.assigned_to), zapp.fn_uuid_safe(OLD.assigned_to))
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

-- E48 parcial (602 funções): executado via DO block dinâmico em produção;
-- critério: prosrc não menciona NENHUM objeto (tabela/view/função/tipo) do schema evo.
-- Reexecução segura: o bloco original filtra por "search_path contém evo", já removido.
