-- Migration: Create zapp VIEW proxies for remaining edge function tables (BUG-41)
--
-- Problem: 10 tables accessed by edge functions via createZappAdminClient()
-- (db: { schema: "zapp" }) have no corresponding view or table in the zapp schema.
-- PostgREST returns PGRST205 at runtime.
--
-- All sources are physical tables in the public schema.
-- All views use security_invoker=on so underlying table RLS still applies.
-- All DO blocks are idempotent: skip if target already exists as table or view.
--
-- Affected edge functions:
--   chatbot-l1              → chatbot_flows
--   whatsapp-flow-handler   → whatsapp_flows
--   send-template           → whatsapp_templates
--   team-chat               → team_conversation_members
--   send-scheduled-report   → scheduled_reports
--   sla-alert-log-failure   → conversation_events
--   contacts-import         → contact_export_log
--   department-invite       → department_invitations
--   file-security-scanner   → file_scan_logs
--   evolution-health        → message_queue

-- ── 1. chatbot_flows ──────────────────────────────────────────────────────────
-- Source: public.chatbot_flows
-- Used by: chatbot-l1
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'chatbot_flows' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.chatbot_flows already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'chatbot_flows' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.chatbot_flows not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.chatbot_flows
        WITH (security_invoker = on)
      AS SELECT * FROM public.chatbot_flows
    $ddl$;
    RAISE NOTICE 'created zapp.chatbot_flows → public.chatbot_flows';
  END IF;
END;
$$;

REVOKE ALL ON zapp.chatbot_flows FROM PUBLIC, anon;
GRANT ALL    ON zapp.chatbot_flows TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.chatbot_flows TO authenticated;

-- ── 2. whatsapp_flows ─────────────────────────────────────────────────────────
-- Source: public.whatsapp_flows
-- Used by: whatsapp-flow-handler
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_flows' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.whatsapp_flows already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_flows' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.whatsapp_flows not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.whatsapp_flows
        WITH (security_invoker = on)
      AS SELECT * FROM public.whatsapp_flows
    $ddl$;
    RAISE NOTICE 'created zapp.whatsapp_flows → public.whatsapp_flows';
  END IF;
END;
$$;

REVOKE ALL ON zapp.whatsapp_flows FROM PUBLIC, anon;
GRANT ALL    ON zapp.whatsapp_flows TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.whatsapp_flows TO authenticated;

-- ── 3. whatsapp_templates ─────────────────────────────────────────────────────
-- Source: public.whatsapp_templates
-- Used by: send-template
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_templates' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.whatsapp_templates already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_templates' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.whatsapp_templates not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.whatsapp_templates
        WITH (security_invoker = on)
      AS SELECT * FROM public.whatsapp_templates
    $ddl$;
    RAISE NOTICE 'created zapp.whatsapp_templates → public.whatsapp_templates';
  END IF;
END;
$$;

REVOKE ALL ON zapp.whatsapp_templates FROM PUBLIC, anon;
GRANT ALL    ON zapp.whatsapp_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.whatsapp_templates TO authenticated;

-- ── 4. team_conversation_members ─────────────────────────────────────────────
-- Source: public.team_conversation_members
-- Used by: team-chat
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversation_members' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.team_conversation_members already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversation_members' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.team_conversation_members not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.team_conversation_members
        WITH (security_invoker = on)
      AS SELECT * FROM public.team_conversation_members
    $ddl$;
    RAISE NOTICE 'created zapp.team_conversation_members → public.team_conversation_members';
  END IF;
END;
$$;

REVOKE ALL ON zapp.team_conversation_members FROM PUBLIC, anon;
GRANT ALL    ON zapp.team_conversation_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.team_conversation_members TO authenticated;

-- ── 5. scheduled_reports ─────────────────────────────────────────────────────
-- Source: public.scheduled_reports
-- Used by: send-scheduled-report
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'scheduled_reports' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.scheduled_reports already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'scheduled_reports' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.scheduled_reports not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.scheduled_reports
        WITH (security_invoker = on)
      AS SELECT * FROM public.scheduled_reports
    $ddl$;
    RAISE NOTICE 'created zapp.scheduled_reports → public.scheduled_reports';
  END IF;
END;
$$;

REVOKE ALL ON zapp.scheduled_reports FROM PUBLIC, anon;
GRANT ALL    ON zapp.scheduled_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.scheduled_reports TO authenticated;

-- ── 6. conversation_events ────────────────────────────────────────────────────
-- Source: public.conversation_events
-- Used by: sla-alert-log-failure
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'conversation_events' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.conversation_events already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'conversation_events' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.conversation_events not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.conversation_events
        WITH (security_invoker = on)
      AS SELECT * FROM public.conversation_events
    $ddl$;
    RAISE NOTICE 'created zapp.conversation_events → public.conversation_events';
  END IF;
END;
$$;

REVOKE ALL ON zapp.conversation_events FROM PUBLIC, anon;
GRANT ALL    ON zapp.conversation_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.conversation_events TO authenticated;

-- ── 7. contact_export_log ─────────────────────────────────────────────────────
-- Source: public.contact_export_log
-- Used by: contacts-import
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'contact_export_log' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.contact_export_log already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'contact_export_log' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.contact_export_log not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.contact_export_log
        WITH (security_invoker = on)
      AS SELECT * FROM public.contact_export_log
    $ddl$;
    RAISE NOTICE 'created zapp.contact_export_log → public.contact_export_log';
  END IF;
END;
$$;

REVOKE ALL ON zapp.contact_export_log FROM PUBLIC, anon;
GRANT ALL    ON zapp.contact_export_log TO service_role;
GRANT SELECT, INSERT, UPDATE ON zapp.contact_export_log TO authenticated;

-- ── 8. department_invitations ─────────────────────────────────────────────────
-- Source: public.department_invitations
-- Used by: department-invite
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'department_invitations' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.department_invitations already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'department_invitations' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.department_invitations not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.department_invitations
        WITH (security_invoker = on)
      AS SELECT * FROM public.department_invitations
    $ddl$;
    RAISE NOTICE 'created zapp.department_invitations → public.department_invitations';
  END IF;
END;
$$;

REVOKE ALL ON zapp.department_invitations FROM PUBLIC, anon;
GRANT ALL    ON zapp.department_invitations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.department_invitations TO authenticated;

-- ── 9. file_scan_logs ─────────────────────────────────────────────────────────
-- Source: public.file_scan_logs
-- Used by: file-security-scanner
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'file_scan_logs' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.file_scan_logs already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'file_scan_logs' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.file_scan_logs not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.file_scan_logs
        WITH (security_invoker = on)
      AS SELECT * FROM public.file_scan_logs
    $ddl$;
    RAISE NOTICE 'created zapp.file_scan_logs → public.file_scan_logs';
  END IF;
END;
$$;

REVOKE ALL ON zapp.file_scan_logs FROM PUBLIC, anon;
GRANT ALL    ON zapp.file_scan_logs TO service_role;
GRANT SELECT, INSERT ON zapp.file_scan_logs TO authenticated;

-- ── 10. message_queue ─────────────────────────────────────────────────────────
-- Source: public.message_queue
-- Used by: evolution-health
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'message_queue' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.message_queue already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'message_queue' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.message_queue not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.message_queue
        WITH (security_invoker = on)
      AS SELECT * FROM public.message_queue
    $ddl$;
    RAISE NOTICE 'created zapp.message_queue → public.message_queue';
  END IF;
END;
$$;

REVOKE ALL ON zapp.message_queue FROM PUBLIC, anon;
GRANT ALL    ON zapp.message_queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.message_queue TO authenticated;
