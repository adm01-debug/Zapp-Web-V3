-- Create system_settings table for storing integration credentials
-- This table stores key-value pairs like Evolution API URL and Key
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read settings
CREATE POLICY "authenticated_read_settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can upsert settings
CREATE POLICY "authenticated_upsert_settings"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_settings"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role full access
CREATE POLICY "service_role_all_settings"
  ON public.system_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings (key);
