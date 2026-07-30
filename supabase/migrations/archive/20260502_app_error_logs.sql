-- Migration: Create app_error_logs table for production error monitoring
-- Used by AppErrorBoundary.tsx to log render errors with context

CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  error_id text,
  module text NOT NULL DEFAULT 'unknown',
  message text NOT NULL,
  stack text,
  component_stack text,
  user_agent text,
  url text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by module and time
CREATE INDEX IF NOT EXISTS idx_app_error_logs_module_ts
  ON public.app_error_logs (module, created_at DESC);

-- Index for looking up specific errors by ID
CREATE INDEX IF NOT EXISTS idx_app_error_logs_error_id
  ON public.app_error_logs (error_id)
  WHERE error_id IS NOT NULL;

-- Auto-cleanup: delete errors older than 30 days (via pg_cron or manual)
COMMENT ON TABLE public.app_error_logs IS
  'Production error logs from AppErrorBoundary. Auto-purge entries older than 30 days.';

-- RLS: allow authenticated users to insert (for error reporting)
-- but only admins can read (for privacy)
ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert errors"
  ON public.app_error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Only admins can read errors"
  ON public.app_error_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'agente_especial')
    )
  );
