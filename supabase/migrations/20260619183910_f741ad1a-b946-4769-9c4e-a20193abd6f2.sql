DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'public.message_reactions already member of supabase_realtime, skipping';
END $$;