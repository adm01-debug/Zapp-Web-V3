-- SUPERSEDED (rodada 4, 2026-08-17): as funcoes alvo nao existem mais (3/4 dropadas;
-- fn_shadow_snapshot_daily movida para zapp com grants corretos authenticated+service_role).
-- Historico documental — NAO reaplicar (REVOKE/GRANT em funcao inexistente = erro).
-- Auditoria de segurança 2026-08-08: funções SECURITY DEFINER no schema evo
-- com acesso ao role anon identificadas em evo.v_security_audit (D-8 gate).
--
-- Contexto: fn_canonical_route_check_daily, fn_shadow_snapshot_daily,
-- fn_shadow_source_measurement e fn_canonical_route_decision foram criadas em
-- 20260808260000_shadow_mode_fns_and_canonical_route_fix.sql com SECURITY
-- DEFINER para elevar privilégios internamente, mas mantinham a concessão
-- padrão de EXECUTE ao PUBLIC (herdada pelo role anon).
--
-- Correção: revoga EXECUTE do PUBLIC e do anon, restringe às roles internas.
-- O gate D-8 (Verify security_invoker on all views) deve ficar verde após esta
-- migration ser aplicada.

REVOKE EXECUTE ON FUNCTION evo.fn_canonical_route_check_daily()
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION evo.fn_shadow_snapshot_daily()
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION evo.fn_shadow_source_measurement(integer)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION evo.fn_canonical_route_decision(integer, numeric)
  FROM PUBLIC, anon;

-- Garante acesso apenas a roles de serviço (chamadas internas / cron jobs).
GRANT EXECUTE ON FUNCTION evo.fn_canonical_route_check_daily()
  TO service_role;

GRANT EXECUTE ON FUNCTION evo.fn_shadow_snapshot_daily()
  TO service_role;

GRANT EXECUTE ON FUNCTION evo.fn_shadow_source_measurement(integer)
  TO service_role;

GRANT EXECUTE ON FUNCTION evo.fn_canonical_route_decision(integer, numeric)
  TO service_role;
