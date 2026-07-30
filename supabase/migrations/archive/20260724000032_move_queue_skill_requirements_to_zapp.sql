-- Migration: move queue_skill_requirements from public to zapp schema
-- Table was created in migration 20260317212204 in public schema.
-- supabase.from('queue_skill_requirements') resolves to zapp.queue_skill_requirements
-- (client configured with db.schema='zapp') → PGRST205 "relation not found in schema cache".
-- useSkillBasedRouting.ts lines 79, 140, 159 are all affected.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename  = 'queue_skill_requirements'
  ) THEN
    ALTER TABLE public.queue_skill_requirements SET SCHEMA zapp;
    RAISE NOTICE 'queue_skill_requirements moved to zapp schema';
  ELSE
    RAISE NOTICE 'queue_skill_requirements already in zapp schema (or does not exist) — skipping move';
  END IF;
END;
$$;

-- Ensure RLS is enabled after the move (conditional — safe on fresh envs if table didn't exist)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'queue_skill_requirements') THEN
    EXECUTE 'ALTER TABLE zapp.queue_skill_requirements ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

-- Drop any stale public-schema policies (carried over names may conflict)
DO $$
DECLARE
  pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'queue_skill_requirements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.queue_skill_requirements', pol);
  END LOOP;
END;
$$;

-- Admins and supervisors can manage skill requirements
CREATE POLICY "admins_manage_queue_skill_requirements"
  ON zapp.queue_skill_requirements
  FOR ALL
  USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());

-- Authenticated users can read skill requirements
CREATE POLICY "authenticated_read_queue_skill_requirements"
  ON zapp.queue_skill_requirements
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Re-grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.queue_skill_requirements TO authenticated;
GRANT ALL ON TABLE zapp.queue_skill_requirements TO service_role;
