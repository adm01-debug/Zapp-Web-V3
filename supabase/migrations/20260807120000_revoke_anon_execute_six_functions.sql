-- =============================================================================
-- Migration: revoke anon EXECUTE das 6 funções sinalizadas pelo
-- security-invoker-gate (auditoria de workflows 2026-08-06 — DB-CAN-018/SEC-12)
--
-- Contexto: o gate Guard — Security Invoker falha em PRs reais porque estas
-- funções têm EXECUTE para o role `anon` (grant herdado de PUBLIC, default do
-- CREATE FUNCTION). Nenhuma chamada real usa role anon — conferido em src/
-- (0 referências além do types.ts gerado) e o gate só verifica zapp/evo.
--
-- Fix: REVOKE de PUBLIC e anon + GRANT explícito a authenticated e
-- service_role (cron/edge functions continuam operando; o app autenticado
-- mantém acesso às leituras legítimas).
--
-- Rollback: GRANT EXECUTE ON FUNCTION <fn> TO PUBLIC; (restaura default).
-- =============================================================================

-- evo.fn_feed_401_disconnect_alerts(integer, integer)
REVOKE EXECUTE ON FUNCTION evo.fn_feed_401_disconnect_alerts(integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION evo.fn_feed_401_disconnect_alerts(integer, integer) TO authenticated, service_role;

-- evo.fn_get_401_payload_v2(integer)
REVOKE EXECUTE ON FUNCTION evo.fn_get_401_payload_v2(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION evo.fn_get_401_payload_v2(integer) TO authenticated, service_role;

-- evo.fn_wpp2_uptime_kpi(interval, text, boolean)
REVOKE EXECUTE ON FUNCTION evo.fn_wpp2_uptime_kpi(interval, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION evo.fn_wpp2_uptime_kpi(interval, text, boolean) TO authenticated, service_role;

-- zapp.fn_alert_health_score_degraded(integer)
REVOKE EXECUTE ON FUNCTION zapp.fn_alert_health_score_degraded(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_health_score_degraded(integer) TO authenticated, service_role;

-- zapp.fn_alert_health_score_degraded(numeric)
REVOKE EXECUTE ON FUNCTION zapp.fn_alert_health_score_degraded(numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_health_score_degraded(numeric) TO authenticated, service_role;

-- zapp.fn_security_self_audit_daily()
REVOKE EXECUTE ON FUNCTION zapp.fn_security_self_audit_daily() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_security_self_audit_daily() TO authenticated, service_role;

-- zapp.fn_webhook_purge_consolidated(integer, integer)
REVOKE EXECUTE ON FUNCTION zapp.fn_webhook_purge_consolidated(integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_webhook_purge_consolidated(integer, integer) TO authenticated, service_role;
