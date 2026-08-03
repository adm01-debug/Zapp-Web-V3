-- M53: F7-20 — Automation executions Realtime + evo compat view
--
-- Problem: useAutomationLogs reads from zapp.automation_executions (physical, already
-- in supabase_realtime) and zapp.automation_rules (physical, NOT in supabase_realtime).
-- Rule mutations from the admin panel don't propagate in real-time.
-- Additionally, evo.evolution_automation_logs exists with a different column schema
-- and has no view mapping to the ExecutionRow interface used by the frontend.
--
-- Fix:
--   1. Add zapp.automation_rules to supabase_realtime publication (idempotent).
--   2. Create view zapp.v_evolution_automation_logs mapping evo.evolution_automation_logs
--      columns to the ExecutionRow interface expected by useAutomationLogs.
--   3. Verify both tables are in the publication.

-- Step 1: Add zapp.automation_rules to supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'automation_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.automation_rules;
    RAISE NOTICE 'M53 F7-20: added zapp.automation_rules to supabase_realtime';
  ELSE
    RAISE NOTICE 'M53 F7-20: zapp.automation_rules already in supabase_realtime';
  END IF;
END $$;

-- Step 2: Create compat view mapping evo.evolution_automation_logs → ExecutionRow schema
-- Columns in evo.evolution_automation_logs:
--   id, automation_id, contact_id, status, trigger_data, action_result,
--   error_message, executed_at
-- Target ExecutionRow columns consumed by useAutomationLogs:
--   id, rule_id, remote_jid, instance_name, status, trigger_payload,
--   suggestion_text, applied_tags, recommended_tag, kb_sources, rule_snapshot,
--   channel_id, department_id, error_message, error_at, acted_at, acted_by,
--   created_at

CREATE OR REPLACE VIEW zapp.v_evolution_automation_logs
  WITH (security_invoker = on)
AS
SELECT
  eal.id::text                                        AS id,
  eal.automation_id::text                             AS rule_id,
  -- contact_id may be a JID string or UUID; expose as remote_jid
  COALESCE(ec.jid, eal.contact_id::text)              AS remote_jid,
  NULL::text                                          AS instance_name,
  eal.status::text                                    AS status,
  eal.trigger_data                                    AS trigger_payload,
  -- Extract suggestion text from action_result JSONB if present
  (eal.action_result ->> 'suggestion_text')::text     AS suggestion_text,
  NULL::text[]                                        AS applied_tags,
  (eal.action_result ->> 'recommended_tag')::text     AS recommended_tag,
  NULL::text[]                                        AS kb_sources,
  NULL::jsonb                                         AS rule_snapshot,
  (eal.action_result ->> 'channel_id')::text          AS channel_id,
  (eal.action_result ->> 'department_id')::text       AS department_id,
  eal.error_message                                   AS error_message,
  CASE WHEN eal.error_message IS NOT NULL THEN eal.executed_at END AS error_at,
  eal.executed_at                                     AS acted_at,
  NULL::text                                          AS acted_by,
  eal.executed_at                                     AS created_at
FROM evo.evolution_automation_logs eal
LEFT JOIN evo.evolution_contacts ec
  ON ec.id = eal.contact_id;

-- Revoke from public/anon; grant to authenticated and service_role
REVOKE ALL ON zapp.v_evolution_automation_logs FROM PUBLIC, anon;
GRANT SELECT ON zapp.v_evolution_automation_logs TO authenticated, service_role;

-- Verification
DO $$
DECLARE
  v_rules_pub  boolean;
  v_exec_pub   boolean;
  v_view_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'automation_rules'
  ) INTO v_rules_pub;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'automation_executions'
  ) INTO v_exec_pub;

  SELECT EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'zapp'
      AND viewname = 'v_evolution_automation_logs'
  ) INTO v_view_exists;

  RAISE NOTICE 'M53 F7-20: automation_rules_in_realtime=%, automation_executions_in_realtime=%, v_evolution_automation_logs_exists=%',
    v_rules_pub, v_exec_pub, v_view_exists;
END $$;
