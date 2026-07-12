-- Add 'manager' to app_role enum (must be in its own transaction before being used)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'manager'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'manager' BEFORE 'supervisor';
  END IF;
END$$;