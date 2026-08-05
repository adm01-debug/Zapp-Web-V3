-- Migration: CSAT Automation Tables (INBOX-09 + DASHBOARD-05)
-- Created: 2026-08-05
-- Tables: zapp.csat_auto_config, zapp.csat_surveys

-- ── csat_auto_config ─────────────────────────────────────────────────────────
-- One row per WhatsApp connection with CSAT send settings.
CREATE TABLE IF NOT EXISTS zapp.csat_auto_config (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id  uuid        NOT NULL
    REFERENCES zapp.whatsapp_connections(id) ON DELETE CASCADE,
  is_enabled              boolean     NOT NULL DEFAULT false,
  message_template        text        NOT NULL DEFAULT '',
  delay_minutes           numeric     NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid        REFERENCES zapp.profiles(id) ON DELETE SET NULL,
  UNIQUE (whatsapp_connection_id)
);

COMMENT ON TABLE zapp.csat_auto_config IS
  'CSAT automation settings per WhatsApp connection (INBOX-09).';
COMMENT ON COLUMN zapp.csat_auto_config.delay_minutes IS
  'Minutes to wait after conversation close before sending the CSAT survey.';
COMMENT ON COLUMN zapp.csat_auto_config.message_template IS
  'WhatsApp message template. Supports {{nome}} variable.';

-- ── csat_surveys ─────────────────────────────────────────────────────────────
-- One row per CSAT survey sent to a contact after conversation resolution.
CREATE TABLE IF NOT EXISTS zapp.csat_surveys (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id                uuid        NOT NULL
    REFERENCES evo.evolution_contacts(id) ON DELETE CASCADE,
  agent_id                  uuid        REFERENCES zapp.profiles(id) ON DELETE SET NULL,
  conversation_resolved_at  timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  rating                    integer     CHECK (rating >= 1 AND rating <= 5),
  feedback                  text
);

COMMENT ON TABLE zapp.csat_surveys IS
  'CSAT survey records created when a conversation is closed (INBOX-09 + DASHBOARD-05).';
COMMENT ON COLUMN zapp.csat_surveys.rating IS
  '1–5 star rating provided by the contact in response to the CSAT message.';
COMMENT ON COLUMN zapp.csat_surveys.feedback IS
  'Optional free-text feedback from the contact.';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS csat_auto_config_connection_idx
  ON zapp.csat_auto_config (whatsapp_connection_id);

CREATE INDEX IF NOT EXISTS csat_surveys_contact_idx
  ON zapp.csat_surveys (contact_id);

CREATE INDEX IF NOT EXISTS csat_surveys_agent_idx
  ON zapp.csat_surveys (agent_id);

CREATE INDEX IF NOT EXISTS csat_surveys_created_at_idx
  ON zapp.csat_surveys (created_at DESC);

CREATE INDEX IF NOT EXISTS csat_surveys_resolved_at_idx
  ON zapp.csat_surveys (conversation_resolved_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE zapp.csat_auto_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.csat_surveys     ENABLE ROW LEVEL SECURITY;

-- csat_auto_config: all authenticated users can read; any authenticated user can write
-- (admin enforcement should be added at app layer or via user_roles check)
CREATE POLICY "csat_auto_config_select"
  ON zapp.csat_auto_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "csat_auto_config_insert"
  ON zapp.csat_auto_config FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "csat_auto_config_update"
  ON zapp.csat_auto_config FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "csat_auto_config_delete"
  ON zapp.csat_auto_config FOR DELETE
  TO authenticated USING (true);

-- csat_surveys: all authenticated users can read and create
CREATE POLICY "csat_surveys_select"
  ON zapp.csat_surveys FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "csat_surveys_insert"
  ON zapp.csat_surveys FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "csat_surveys_update"
  ON zapp.csat_surveys FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Grant service_role full access (used by edge functions via createZappAdminClient)
GRANT ALL ON zapp.csat_auto_config TO service_role;
GRANT ALL ON zapp.csat_surveys      TO service_role;
