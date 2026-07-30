-- 1. Conversation Transfers - Update Policy
-- Permite que agentes do destino aceitem/completem e agentes da origem editem (ex: cancelar)
CREATE POLICY "Agents can update transfers for their instances"
ON public.conversation_transfers FOR UPDATE
USING (
    source_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
    OR 
    target_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
)
WITH CHECK (
    source_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
    OR 
    target_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
);

-- 2. Conversation Transfers - Insert Policy
-- Permite criar transferências apenas se o usuário for membro da instância de origem
CREATE POLICY "Agents can create transfers from their instances"
ON public.conversation_transfers FOR INSERT
WITH CHECK (
    source_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
);

-- 3. Instance Registry - Force RLS for safety (even if viewed by all)
-- Já existe uma policy SELECT true, garantindo que membros de qualquer instância vejam o mapa de instâncias para transferir
-- Mas removemos políticas redundantes se houverem.

-- 4. Audit Log Policies
-- Garantir que a trilha de auditoria seja visível apenas para os envolvidos
DROP POLICY IF EXISTS "Users can view audit logs for their instances" ON public.transfer_audit_log;
CREATE POLICY "Access audit logs by instance membership"
ON public.transfer_audit_log FOR SELECT
USING (
    instance_name IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
);
