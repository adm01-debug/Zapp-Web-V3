-- Migration: revoke overly-permissive anon UPDATE on zapp.cookies_config
-- Audit finding 2026-07-16: policy allow_anon_update_health had USING(true)
-- granting any anonymous client the ability to UPDATE any row in cookies_config.
-- This table stores cookie consent / health-check flags; anon should only SELECT.

-- 1. Drop the permissive policy
DROP POLICY IF EXISTS allow_anon_update_health ON zapp.cookies_config;

-- 2. Replace with a safe SELECT-only policy for anon
--    (anon may need to READ consent config to display the cookie banner)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'cookies_config'
      AND policyname = 'allow_anon_select_cookies'
  ) THEN
    EXECUTE 'CREATE POLICY allow_anon_select_cookies
      ON zapp.cookies_config
      FOR SELECT
      TO anon
      USING (true)';
  END IF;
END;
$$;

-- 3. Ensure authenticated users can update their own cookie preferences only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'cookies_config'
      AND policyname = 'allow_auth_update_own_cookies'
  ) THEN
    EXECUTE 'CREATE POLICY allow_auth_update_own_cookies
      ON zapp.cookies_config
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  END IF;
END;
$$;
