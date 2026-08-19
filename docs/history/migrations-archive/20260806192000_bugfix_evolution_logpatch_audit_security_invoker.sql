-- Bugfix de Segurança (06/08/2026): zapp.evolution_logpatch_audit sem security_invoker
-- ===========================================================================
-- RISCO: RLS bypass em evo.evolution_logpatch_audit
--
-- A migration 20260805220000_revive_logpatch_audit_view_trigger.sql criou
-- zapp.evolution_logpatch_audit sem WITH (security_invoker = on).
-- Resultado: qualquer SELECT em /rest/v1/evolution_logpatch_audit via
-- Accept-Profile: zapp executa com privilégios do DONO da view (postgres ou
-- supabase_admin), ignorando completamente as RLS policies de
-- evo.evolution_logpatch_audit. O schema evo tem RLS habilitado em 100% das
-- tabelas (auditado 2026-08-04); esse bypass anula a proteção.
--
-- O schema public.evolution_logpatch_audit (que tem o trigger INSTEAD OF INSERT)
-- também não tinha security_invoker — corrigido aqui também. O trigger de INSERT
-- em public usa SECURITY DEFINER, portanto o path de escrita não é afetado por
-- esta correção (a function já executa com seu próprio search_path fixo).
--
-- Fix: recriar ambas as views com WITH (security_invoker = on).
--   CREATE OR REPLACE VIEW é idempotente para a estrutura — o RLS passa a ser
--   avaliado com o invoker, alinhando o comportamento com todas as outras
--   views do schema zapp que já têm security_invoker=on.
--
-- Impacto esperado em produção:
--   - SELECTs passam a validar RLS de evo.evolution_logpatch_audit
--   - INSERTs via trigger INSTEAD OF em public não são afetados (SECURITY DEFINER)
--   - Se alguma policy de evo.evolution_logpatch_audit restringir acesso por role,
--     queries anonimizadas passarão a ser filtradas corretamente
-- ===========================================================================

-- Fix da view no schema zapp (path PostgREST Accept-Profile: zapp)
CREATE OR REPLACE VIEW zapp.evolution_logpatch_audit
WITH (security_invoker = on) AS
SELECT id, container_id, force_update, patch_version, t1_ok, t2_ok, t3_ok, t4_ok, t5_ok,
       patched_size_bytes, boot_at, verified_at, notes, instance_name, booted_at,
       image_digest, evolution_version, logpatch_status, logpatch_detail
FROM evo.evolution_logpatch_audit;

-- Fix da view no schema public (path PostgREST sem Accept-Profile)
CREATE OR REPLACE VIEW public.evolution_logpatch_audit
WITH (security_invoker = on) AS
SELECT id, container_id, force_update, patch_version, t1_ok, t2_ok, t3_ok, t4_ok, t5_ok,
       patched_size_bytes, boot_at, verified_at, notes, instance_name, booted_at,
       image_digest, evolution_version, logpatch_status, logpatch_detail
FROM evo.evolution_logpatch_audit;

-- Recriar trigger INSTEAD OF INSERT na view public (mantido após CREATE OR REPLACE VIEW)
-- O trigger não é descartado por CREATE OR REPLACE VIEW em PostgreSQL 14+, mas
-- recriar explicitamente garante idempotência.
DROP TRIGGER IF EXISTS trg_logpatch_audit_ins ON public.evolution_logpatch_audit;
CREATE TRIGGER trg_logpatch_audit_ins
  INSTEAD OF INSERT ON public.evolution_logpatch_audit
  FOR EACH ROW EXECUTE FUNCTION public.evo_logpatch_audit_ins();
