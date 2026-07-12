ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Ensure RLS allows support agents to update metadata for transfers
-- We'll add a policy specifically for metadata updates if needed, 
-- but usually UPDATE is already covered or needs refinement.

-- Add a policy for Support Agents to transfer conversations (update department_id and metadata)
CREATE POLICY "Support agents can transfer any conversation"
ON public.team_conversations
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'admin'));
