-- Fix AuthProvider.tsx Realtime subscriptions:
-- Both zapp.profiles and zapp.user_roles must be in the supabase_realtime
-- publication so that postgres_changes events fire for logged-in users.
-- Without this, profile updates and role changes are silently missed until
-- the next full page reload.

DO $$
DECLARE
  pub_name TEXT := 'supabase_realtime';
  tbl      TEXT;
  tables   TEXT[] := ARRAY['profiles', 'user_roles'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = pub_name
        AND schemaname = 'zapp'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION %I ADD TABLE zapp.%I', pub_name, tbl);
      RAISE NOTICE 'Added zapp.% to publication %', tbl, pub_name;
    ELSE
      RAISE NOTICE 'zapp.% already in publication % — skipped', tbl, pub_name;
    END IF;
  END LOOP;
END $$;
