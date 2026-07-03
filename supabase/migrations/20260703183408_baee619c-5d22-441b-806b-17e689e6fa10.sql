
CREATE SCHEMA IF NOT EXISTS evo;
GRANT USAGE ON SCHEMA evo TO service_role;

-- evolution_messages
CREATE TABLE IF NOT EXISTS evo.evolution_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  remote_jid TEXT,
  message_id TEXT,
  from_me BOOLEAN DEFAULT false,
  push_name TEXT,
  message_type TEXT,
  content TEXT,
  media_url TEXT,
  status TEXT,
  timestamp TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evo_messages_jid ON evo.evolution_messages(remote_jid);
CREATE INDEX IF NOT EXISTS idx_evo_messages_instance ON evo.evolution_messages(instance_name);
CREATE INDEX IF NOT EXISTS idx_evo_messages_ts ON evo.evolution_messages(timestamp DESC);

-- evolution_contacts
CREATE TABLE IF NOT EXISTS evo.evolution_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  remote_jid TEXT,
  push_name TEXT,
  profile_pic_url TEXT,
  is_group BOOLEAN DEFAULT false,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evo_contacts_jid ON evo.evolution_contacts(remote_jid);

-- evolution_conversations
CREATE TABLE IF NOT EXISTS evo.evolution_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  remote_jid TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evo_conv_jid ON evo.evolution_conversations(remote_jid);

-- evolution_calls
CREATE TABLE IF NOT EXISTS evo.evolution_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  remote_jid TEXT,
  call_id TEXT,
  direction TEXT,
  status TEXT,
  duration_seconds INTEGER,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_realtime_events
CREATE TABLE IF NOT EXISTS evo.evolution_realtime_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  event_type TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_webhook_events
CREATE TABLE IF NOT EXISTS evo.evolution_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  event_type TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evo_wh_events_created ON evo.evolution_webhook_events(created_at DESC);

-- evolution_webhook_events_wpp2
CREATE TABLE IF NOT EXISTS evo.evolution_webhook_events_wpp2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  event_type TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_audit_log
CREATE TABLE IF NOT EXISTS evo.evolution_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_labels
CREATE TABLE IF NOT EXISTS evo.evolution_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  label_id TEXT,
  name TEXT,
  color TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_label_associations
CREATE TABLE IF NOT EXISTS evo.evolution_label_associations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  label_id TEXT,
  remote_jid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_reactions
CREATE TABLE IF NOT EXISTS evo.evolution_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  message_id TEXT,
  remote_jid TEXT,
  reaction TEXT,
  from_me BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_whatsapp_status
CREATE TABLE IF NOT EXISTS evo.evolution_whatsapp_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  status TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_settings
CREATE TABLE IF NOT EXISTS evo.evolution_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evolution_alerts
CREATE TABLE IF NOT EXISTS evo.evolution_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  severity TEXT,
  message TEXT,
  details JSONB,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants: acessadas apenas pelo external-db-proxy via service_role
GRANT ALL ON ALL TABLES IN SCHEMA evo TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA evo GRANT ALL ON TABLES TO service_role;

-- RLS habilitada em todas (bloqueia acesso direto via anon/authenticated; service_role ignora RLS)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'evo'
  LOOP
    EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;
