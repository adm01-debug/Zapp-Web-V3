-- Fix RLS + policies + grants for remaining tables
ALTER TABLE IF EXISTS public.scheduled_job_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media_storage_config ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY['scheduled_job_log','media_storage_config','integration_profiles','email_attachments','email_labels','email_messages','gmail_attachments','outbox_events','reprocess_jobs','sticky_assignments','webhook_event_dedup','webhook_rate_limits']) LOOP
    BEGIN EXECUTE format('CREATE POLICY auth_rw ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE format('CREATE POLICY svc_rw ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t); EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
