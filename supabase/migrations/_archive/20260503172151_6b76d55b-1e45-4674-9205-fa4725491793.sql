ALTER TABLE public.team_conversations DROP CONSTRAINT IF EXISTS team_conversations_type_check;
ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_type_check CHECK (type IN ('direct', 'group', 'department'));
