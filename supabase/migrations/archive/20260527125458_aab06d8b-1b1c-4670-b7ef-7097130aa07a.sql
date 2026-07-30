-- Add missing column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_seen') THEN
        ALTER TABLE public.profiles ADD COLUMN last_seen TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Fix Function Search Path Mutability for ALL public functions safely
-- This query iterates through all functions and applies the ALTER statement
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (
    SELECT 
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
  ) LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.schema_name, r.function_name, r.args);
  END LOOP;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Add index on last_seen for performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen);
