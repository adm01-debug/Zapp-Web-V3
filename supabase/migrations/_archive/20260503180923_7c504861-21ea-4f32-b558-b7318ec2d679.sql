CREATE TABLE public.team_message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (message_id, profile_id, emoji)
);

CREATE INDEX idx_team_message_reactions_msg ON public.team_message_reactions(message_id);

ALTER TABLE public.team_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions"
ON public.team_message_reactions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_messages m
  WHERE m.id = team_message_reactions.message_id
    AND public.is_team_conversation_member(auth.uid(), m.conversation_id)
));

CREATE POLICY "Members can add own reactions"
ON public.team_message_reactions FOR INSERT TO authenticated
WITH CHECK (
  profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  AND EXISTS (
    SELECT 1 FROM public.team_messages m
    WHERE m.id = team_message_reactions.message_id
      AND public.is_team_conversation_member(auth.uid(), m.conversation_id)
  )
);

CREATE POLICY "Members can remove own reactions"
ON public.team_message_reactions FOR DELETE TO authenticated
USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_message_reactions;
ALTER TABLE public.team_message_reactions REPLICA IDENTITY FULL;