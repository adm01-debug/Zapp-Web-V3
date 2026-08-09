-- ═══════════════════════════════════════════════════════════════════════════
-- 20260809000000_versioned_drops_and_jwt_ref.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo (C5): versionar no fresh env / CI o que hoje existe SÓ no banco live:
--   1. Drops de tabelas mortas do schema evo (executados por SQL direto NÃO
--      versionado no live) — agora idempotentes via DROP TABLE IF EXISTS.
--   2. RPCs zapp.fn_jwt_secret_ref e public.fn_jwt_secret_ref (guardrail HMAC)
--      — criadas por SQL direto no live, ausentes de TODAS as migrations.
--      Sem elas, rebuild do banco = guardrail cego (simulação C5).
--
-- Idempotência: TODAS as instruções são re-executáveis (IF EXISTS / OR REPLACE /
-- GRANT repetível). Pode rodar em fresh env, em live, ou N vezes.
--
-- NOTA DE ENGENHARIA (verificada em live em 2026-08-08):
--   evo.evolution_deals e evo.evolution_followups NÃO são dropadas aqui,
--   apesar de evolution_followups ter 0 rows e evolution_deals 9 rows.
--   Elas POSSUEM consumidores:
--     - Código versionado: public.rpc_get_contact(uuid) (squash, linha ~15677)
--       faz `FROM evo.evolution_deals d`; ~25 RPCs/functions zapp.* de
--       pipeline/followup (rpc_upsert_deal, rpc_move_deal, fn_process_pending_followups,
--       trg_create_followups_on_stage_change, ...) referenciam as duas tabelas.
--     - Views live (não versionadas): zapp/public.evolution_deals e
--       zapp/public.evolution_followups, mais v_sales_pipeline, v_contact_360,
--       v_complete_dashboard, v_pending_tasks, v_realtime_dashboard, v_top_contacts,
--       v_daily_sales_summary.
--     - Matview live: zapp.mv_system_status.
--   Dropar = quebrar views/functions no fresh env (risco "views dependentes
--   quebram" da simulação). As que foram dropadas no live SEM consumidores e
--   versionadas aqui são: evolution_broadcasts, evolution_automations,
--   evolution_groups (verificado: 0 referências em pg_proc/pg_views/pg_matviews).
--
-- NOTA DE PARIDADE RPC: no live, public.fn_jwt_secret_ref retorna os primeiros
-- 8 chars do digest e zapp.fn_jwt_secret_ref retorna o hex completo. Esta
-- migration normaliza AMBAS para left(...,8) conforme spec C5 — seguro, pois a
-- verificação de dependências (pg_policies/pg_proc/pg_views/pg_matviews) mostrou
-- ZERO consumidores internos da função; ela é guardrail externo/health-check.
-- Atributos espelhados do live: SECURITY DEFINER + STABLE + EXECUTE para
-- anon/authenticated/service_role (proacl verificado).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Drops versionados e idempotentes (D-1 / C-7)
-- Tabelas mortas do schema evo, sem consumidores (0 refs em functions/views/
-- matviews/triggers/FKs). IF EXISTS: no-op se o fresh env (squash) nunca as
-- criou, ou se já foram dropadas.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS evo.evolution_broadcasts;
DROP TABLE IF EXISTS evo.evolution_automations;
DROP TABLE IF EXISTS evo.evolution_groups;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — RPCs guardrail fn_jwt_secret_ref (zapp + public)
-- Corpo exato spec C5: left(encode(extensions.digest(...),'sha256'),'hex'),8)
-- CREATE OR REPLACE → idempotente. SECURITY DEFINER + STABLE = paridade live.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_jwt_secret_ref()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT left(encode(extensions.digest(current_setting('app.settings.jwt_secret', true)::text, 'sha256'), 'hex'), 8)
$$;

-- GRANT EXECUTE apenas para roles autenticados/serviço (política da casa: sem anon em funções — Edge Schema Parity)
GRANT EXECUTE ON FUNCTION public.fn_jwt_secret_ref() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION zapp.fn_jwt_secret_ref()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT left(encode(extensions.digest(current_setting('app.settings.jwt_secret', true)::text, 'sha256'), 'hex'), 8)
$$;

-- GRANT EXECUTE apenas para roles autenticados/serviço (política da casa: sem anon em funções — Edge Schema Parity)
GRANT EXECUTE ON FUNCTION zapp.fn_jwt_secret_ref() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Recarrega o schema cache do PostgREST (RPCs novas ficam expostas)
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
