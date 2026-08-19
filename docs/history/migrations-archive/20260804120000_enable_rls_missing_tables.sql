-- Enable RLS on 13 zapp-schema tables that had policies defined but RLS not enabled.
-- Pre-existing CI blocker detected by audit-rls-coverage.mjs (E34).
-- Policies already exist in 20260804000000_canonical_schema.sql for 11 of these tables.
-- warroom_alerts and voice_conversion_queue receive permissive policies here to preserve
-- the same access level they had before RLS was activated (service_role bypasses RLS
-- implicitly via BYPASSRLS attribute).

-- ── Tables with existing policies: just enable RLS ───────────────────────────

ALTER TABLE zapp.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.queue_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.queues              ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.talkx_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.talkx_recipients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.team_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.webhook_audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- ── Tables without existing policies: enable RLS + add permissive policy ─────

ALTER TABLE zapp.voice_conversion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_conversion_queue_authenticated
  ON zapp.voice_conversion_queue
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE zapp.warroom_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY warroom_alerts_authenticated
  ON zapp.warroom_alerts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
