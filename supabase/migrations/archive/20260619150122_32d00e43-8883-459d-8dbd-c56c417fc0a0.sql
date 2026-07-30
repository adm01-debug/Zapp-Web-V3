
-- 1) team_message_receipts: SELECT escopo por membro da conversa
DROP POLICY IF EXISTS "Users view team receipts" ON public.team_message_receipts;
CREATE POLICY "Users view team receipts"
  ON public.team_message_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_messages tm
      WHERE tm.id = team_message_receipts.message_id
        AND public.is_team_conversation_member(auth.uid(), tm.conversation_id)
    )
  );

-- 2) conversation_transfers: INSERT restrito ao próprio profile (ou admin/supervisor)
DROP POLICY IF EXISTS "Authenticated users can insert transfers" ON public.conversation_transfers;
CREATE POLICY "Authenticated users can insert transfers"
  ON public.conversation_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR from_agent_id = public.get_profile_id_for_user(auth.uid())
  );

-- 3) global_settings: remover SELECT permissivo "para todo staff"
DROP POLICY IF EXISTS "Global settings are viewable by all staff" ON public.global_settings;
