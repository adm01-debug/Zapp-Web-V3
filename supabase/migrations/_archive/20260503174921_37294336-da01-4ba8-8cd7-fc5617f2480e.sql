-- Add deleted_at columns
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Update RLS policies to filter out deleted messages
DROP POLICY IF EXISTS "Members can view conversation messages" ON public.team_messages;
CREATE POLICY "Members can view conversation messages"
ON public.team_messages
FOR SELECT
TO authenticated
USING (is_team_conversation_member(auth.uid(), conversation_id) AND deleted_at IS NULL);

-- Allow admins to soft delete
CREATE POLICY "Admins can soft delete any message"
ON public.team_messages
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update conversations view policy
DROP POLICY IF EXISTS "Users can view their conversations" ON public.team_conversations;
CREATE POLICY "Users can view their conversations"
ON public.team_conversations
FOR SELECT
TO authenticated
USING ((is_team_conversation_member(auth.uid(), id) OR (type = 'department' AND (department_id IS NULL OR department_id = (SELECT department_id FROM profiles WHERE user_id = auth.uid() LIMIT 1)))) AND deleted_at IS NULL);
