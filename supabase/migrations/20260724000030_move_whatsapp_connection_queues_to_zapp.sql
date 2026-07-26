-- Migration: move whatsapp_connection_queues from public to zapp schema
-- The Supabase client is configured with db: { schema: 'zapp' } and sends
-- Accept-Profile: zapp on every request. The table was created in public
-- (migrations 20260315193759 and 20260502_create_missing_tables), so all
-- reads/writes via supabase.from('whatsapp_connection_queues') fail with
-- PGRST205 "relation not found in schema cache".
-- useConnectionManagement.ts lines 120, 134, 148 are all affected.

DO $$
BEGIN
  -- Check if table is still in public schema (idempotent)
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_connection_queues'
  ) THEN
    ALTER TABLE public.whatsapp_connection_queues SET SCHEMA zapp;
    RAISE NOTICE 'whatsapp_connection_queues moved to zapp schema';
  ELSE
    RAISE NOTICE 'whatsapp_connection_queues already in zapp schema, skipping';
  END IF;
END;
$$;

-- Ensure RLS is enabled after the move (conditional — safe on fresh envs if table didn't exist)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'whatsapp_connection_queues') THEN
    EXECUTE 'ALTER TABLE zapp.whatsapp_connection_queues ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

-- Re-grant access (any existing policies were carried over with the table)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.whatsapp_connection_queues TO authenticated;
GRANT ALL ON TABLE zapp.whatsapp_connection_queues TO service_role;
