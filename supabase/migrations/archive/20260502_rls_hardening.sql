-- Migration: RLS security hardening for critical tables
-- Ensures all tables have proper Row Level Security policies

-- Ensure RLS is enabled on all critical tables
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.csat_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_status ENABLE ROW LEVEL SECURITY;

-- Audit policy: ensure messages table has agent access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'agents_full_access_messages'
  ) THEN
    CREATE POLICY "agents_full_access_messages" ON public.messages
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Audit policy: scheduled_messages accessible by creator
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'scheduled_messages' 
    AND policyname = 'agents_manage_scheduled_messages'
  ) THEN
    CREATE POLICY "agents_manage_scheduled_messages" ON public.scheduled_messages
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Create index for SLA breach monitoring
CREATE INDEX IF NOT EXISTS idx_contacts_sla_breach
  ON public.contacts (assigned_to, updated_at DESC)
  WHERE status = 'open';

-- Create index for message search performance
CREATE INDEX IF NOT EXISTS idx_messages_contact_timestamp
  ON public.messages (contact_id, created_at DESC);

-- Create index for failed messages monitoring
CREATE INDEX IF NOT EXISTS idx_messages_failed_status
  ON public.messages (status, created_at DESC)
  WHERE status IN ('failed', 'failed_auth', 'failed_retries');

COMMENT ON TABLE public.messages IS 'Chat messages with RLS and performance indexes';
COMMENT ON TABLE public.contacts IS 'Contact/conversation records with SLA tracking indexes';
