-- ============================================================================
-- A-8: Reativar trilha de auditoria evo.evolution_logpatch_audit via REST
-- ----------------------------------------------------------------------------
-- Problema: o entrypoint da evolution (A-8) faz POST em /rest/v1/
-- evolution_logpatch_audit, mas o PostgREST resolve para as VIEWs espelho
-- public/zapp (criadas ANTES das colunas novas: instance_name, booted_at,
-- image_digest, evolution_version, logpatch_status, logpatch_detail) ->
-- HTTP 400 PGRST204 ("Could not find the 'booted_at' column ... in the
-- schema cache").
--
-- Fix: atualizar as views com TODAS as colunas + trigger INSTEAD OF INSERT
-- que grava na tabela real evo.evolution_logpatch_audit (service_role já tem
-- INSERT na view public; schema evo NÃO está exposto no PGRST_DB_SCHEMAS e
-- não precisa estar — a view public já é exposta).
--
-- Após aplicar: reiniciar o container supabase_rest (schema cache do
-- PostgREST) — NOTIFY pgrst não funciona (db-channel-enabled=off).
-- ============================================================================

CREATE OR REPLACE VIEW public.evolution_logpatch_audit AS
SELECT id, container_id, force_update, patch_version, t1_ok, t2_ok, t3_ok, t4_ok, t5_ok,
       patched_size_bytes, boot_at, verified_at, notes, instance_name, booted_at,
       image_digest, evolution_version, logpatch_status, logpatch_detail
FROM evo.evolution_logpatch_audit;

CREATE OR REPLACE VIEW zapp.evolution_logpatch_audit AS
SELECT id, container_id, force_update, patch_version, t1_ok, t2_ok, t3_ok, t4_ok, t5_ok,
       patched_size_bytes, boot_at, verified_at, notes, instance_name, booted_at,
       image_digest, evolution_version, logpatch_status, logpatch_detail
FROM evo.evolution_logpatch_audit;

CREATE OR REPLACE FUNCTION public.evo_logpatch_audit_ins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = evo, public AS $fn$
BEGIN
  INSERT INTO evo.evolution_logpatch_audit
    (container_id, force_update, patch_version, t1_ok, t2_ok, t3_ok, t4_ok, t5_ok,
     patched_size_bytes, boot_at, verified_at, notes, instance_name, booted_at,
     image_digest, evolution_version, logpatch_status, logpatch_detail)
  VALUES
    (COALESCE(NEW.container_id,'unknown'), NEW.force_update, NEW.patch_version,
     COALESCE(NEW.t1_ok,false), COALESCE(NEW.t2_ok,false), COALESCE(NEW.t3_ok,false),
     COALESCE(NEW.t4_ok,false), COALESCE(NEW.t5_ok,false), NEW.patched_size_bytes,
     COALESCE(NEW.boot_at, now()), NEW.verified_at, NEW.notes,
     COALESCE(NEW.instance_name,'wpp2'), COALESCE(NEW.booted_at, now()),
     NEW.image_digest, NEW.evolution_version, COALESCE(NEW.logpatch_status,'ok'),
     COALESCE(NEW.logpatch_detail,'{}'::jsonb));
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_logpatch_audit_ins ON public.evolution_logpatch_audit;
CREATE TRIGGER trg_logpatch_audit_ins INSTEAD OF INSERT ON public.evolution_logpatch_audit
FOR EACH ROW EXECUTE FUNCTION public.evo_logpatch_audit_ins();
