-- 20260817130500_decouple_pii_conversations_role_guard
-- Espelho DB-as-source (reconstruido do estado vivo em 2026-08-18; aplicado
-- originalmente via MCP em 2026-08-17). Guard de role em conversas:
--  * zapp.can_see_pii(): helper de role p/ mascaramento de PII
--    (NOTA 2026-08-18: sem call sites vivos no banco - candidata a uso futuro
--    ou remocao; espelhada porque existe com GRANTs a authenticated)
--  * policies de evo.evolution_conversations com guard de role:
--    SELECT via admin/supervisor OU contato visivel; UPDATE so admin/supervisor
-- Idempotente.

CREATE OR REPLACE FUNCTION zapp.can_see_pii()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM zapp.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager', 'agente_especial')
  )
$function$;
REVOKE ALL ON FUNCTION zapp.can_see_pii() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.can_see_pii() TO authenticated, service_role;

DROP POLICY IF EXISTS conversations_select ON evo.evolution_conversations;
CREATE POLICY conversations_select ON evo.evolution_conversations
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_admin_or_supervisor(auth.uid())
      OR EXISTS (
        SELECT 1 FROM evo.evolution_contacts c
        WHERE c.remote_jid::text = evolution_conversations.remote_jid::text
          AND c.instance_name::text = evolution_conversations.instance_name::text
          AND is_contact_visible_to_user(c.id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS conversations_update ON evo.evolution_conversations;
CREATE POLICY conversations_update ON evo.evolution_conversations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])
    )
  );
