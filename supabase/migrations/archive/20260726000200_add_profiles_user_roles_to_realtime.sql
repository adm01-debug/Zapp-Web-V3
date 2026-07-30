-- Migration: Add zapp.profiles and zapp.user_roles to supabase_realtime publication
-- Context: AuthProvider subscribes to profile/role changes for live session refresh.
-- The subscriptions previously used schema:'public' (VIEW proxies — never emit CDC).
-- Fixed to schema:'zapp' (physical tables), so the publication must include them.

DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'user_roles'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'zapp'
        AND tablename = t
    ) THEN
      missing := missing || t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY missing LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE zapp.%I', t);
    RAISE NOTICE 'Added zapp.% to supabase_realtime', t;
  END LOOP;

  IF array_length(missing, 1) IS NULL THEN
    RAISE NOTICE 'zapp.profiles and zapp.user_roles already in supabase_realtime — no-op';
  END IF;
END $$;
