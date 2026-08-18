-- 20260818180000 — Warroom: dismiss de alerta via RPC com check de visibilidade
-- =============================================================================
-- Regressão latente (achado R3-FINAL 2026-08-18): desde o hardening de 05/08
-- (UPDATE admin-only), o dismissAlert do front (useAlertManagement.ts:197)
-- faz update direto como usuário comum → RLS filtra SILENCIOSAMENTE (0 rows,
-- sem erro) → alerta nunca marca como lido para não-admin.
--
-- Fix (CONSTRUIR, nunca esconder): RPC SECURITY DEFINER que exige member do
-- workspace (mesmo predicado da policy SELECT apertada no R3 Grupo B) e faz o
-- UPDATE. Não reabre a policy direta (hardening mantido). Rollback: DROP
-- FUNCTION + front volta ao update direto.

BEGIN;

CREATE OR REPLACE FUNCTION zapp.rpc_dismiss_warroom_alert(p_alert_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp'
AS $fn$
DECLARE
  v_is_member boolean;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ) OR zapp.is_admin_or_supervisor(auth.uid()) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN false; -- falha honesta: sem member, nada é marcado
  END IF;

  UPDATE zapp.warroom_alerts
     SET is_read = true,
         updated_at = now()
   WHERE id = p_alert_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dismiss_warroom_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_dismiss_warroom_alert(uuid) TO authenticated;

COMMIT;
