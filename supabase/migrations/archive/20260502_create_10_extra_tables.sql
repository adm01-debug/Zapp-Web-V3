-- MIGRATION: 10 extra orphan tables (double-quote references)
-- Date: 2026-05-02
BEGIN;

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid,
  rule_id uuid,
  contact_id uuid,
  trigger_event text,
  status text DEFAULT 'pending',
  result jsonb DEFAULT '{}'::jsonb,
  error_message text,
  executed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  execution_count integer DEFAULT 0,
  last_executed_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channel_queues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id uuid NOT NULL,
  queue_id uuid NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.connection_alert_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid,
  alert_type text NOT NULL,
  is_enabled boolean DEFAULT true,
  channels jsonb DEFAULT '["web"]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_error_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid,
  contact_id uuid,
  instance_name text,
  error_code text,
  error_message text,
  http_status integer,
  payload jsonb DEFAULT '{}'::jsonb,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  ip_address text,
  user_agent text,
  success boolean DEFAULT false,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_message_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  instance_name text,
  direction text NOT NULL,
  remote_jid text,
  message_id text,
  status text,
  http_status integer,
  request_body jsonb,
  response_body jsonb,
  duration_ms integer,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.query_telemetry (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  query_hash text,
  query_text text,
  execution_time_ms integer,
  rows_affected integer,
  user_id uuid,
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_channels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  channel_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_webhook_pings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name text,
  challenge text,
  verify_token text,
  status text DEFAULT 'received',
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_cloud_webhook_pings ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated full access, service_role bypass
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'automation_executions','automation_rules','channel_queues',
    'connection_alert_preferences','dispatch_error_logs','login_attempts',
    'provider_message_log','query_telemetry','service_channels',
    'whatsapp_cloud_webhook_pings'
  ]) LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS auth_full_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY IF NOT EXISTS service_full_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Grant access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

COMMIT;
