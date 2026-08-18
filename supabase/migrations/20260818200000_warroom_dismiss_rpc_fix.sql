-- 20260818200000 — Warroom dismiss: FIX da RPC (coluna updated_at não existe)
-- =============================================================================
-- Validação adversarial 2026-08-18 (10 agentes): a RPC criada em
-- 20260818180000 referenciava `updated_at`, coluna que NÃO existe em
-- zapp.warroom_alerts (nem no repo, nem em produção — provado via
-- information_schema + UPDATE com ROLLBACK). O caminho feliz falhava com
-- "column updated_at does not exist" (o canário original só testava o caminho
-- negado — fake user — e não pegou).
--
-- Fix: colunas REAIS da tabela — is_read + dismissed_by (quem dispensou) +
-- resolved_at (COALESCE). CREATE OR REPLACE idempotente; GRANTs mantidos.

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
         dismissed_by = auth.uid(),
         resolved_at = COALESCE(resolved_at, now())
   WHERE id = p_alert_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dismiss_warroom_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_dismiss_warroom_alert(uuid) TO authenticated;

-- [Achado validação 2026-08-18] Grant blanket pré-existente (EXECUTE em ALL
-- FUNCTIONS p/ authenticated) anulava o REVOKE PUBLIC do dispatcher: qualquer
-- autenticado conseguia executar fn_dispatch_scheduled_messages() (marcar
-- agendadas como enviadas + RETURNING * vaza conteúdo). REVOKE direto:
REVOKE EXECUTE ON FUNCTION zapp.fn_dispatch_scheduled_messages() FROM authenticated;

COMMIT;
