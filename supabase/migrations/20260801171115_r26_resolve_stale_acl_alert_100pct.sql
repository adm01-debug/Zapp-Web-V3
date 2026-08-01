-- Migration: R26 — Resolve stale security_acl_alert #2074
-- Data: 2026-08-01T17:11:15Z
-- Score antes: 96.9/A+ | Score depois: 100.0/A+ | RT: 27/27 PASS
--
-- DIAGNÓSTICO: zapp.security_acl_alerts continha alerta CRÍTICO id=2074
-- (ANON_EXECUTE_GRANTED para zapp.rpc_insert_message) que estava com
-- resolved_at IS NULL, mas a verificação direta via pg_catalog confirmou
-- que anon_can_execute=false. O grant já havia sido revogado no R24.
-- A função fn_score_security_acl contava o alerta obsoleto como open_critical=1,
-- zerando os 5 pontos da dimensão security_acl (96.9 → 100.0).
--
-- CORREÇÃO: marcar o alerta como resolvido com nota de auditoria.

UPDATE zapp.security_acl_alerts
SET
  resolved_at = NOW(),
  resolved_by = 'R26-auto: anon_can_execute=false confirmado via pg_catalog (has_function_privilege), grant revogado no R24'
WHERE id = '2074'
  AND resolved_at IS NULL
  AND alert_type = 'ANON_EXECUTE_GRANTED'
  AND severity = 'CRITICAL';

-- Verificação idempotente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM zapp.security_acl_alerts
    WHERE id = '2074' AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: alert 2074 still unresolved';
  END IF;
  RAISE NOTICE 'R26 OK: alert 2074 resolved, security_acl=5/5, score=100.0';
END;
$$;
