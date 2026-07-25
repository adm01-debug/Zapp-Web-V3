-- Migration: Create zapp VIEW proxies + missing tables for edge functions (Batch 2)
--
-- Problem: Multiple edge functions use createZappAdminClient() (db.schema='zapp')
-- but reference tables that only exist in evo/public schema, causing PGRST205.
--
-- All DDL uses idempotent DO blocks: check pg_class before any CREATE/ALTER.
-- Tables already in zapp are skipped silently.
--
-- Affected edge functions:
--   evolution-sentiment   → evolution_contacts (HIGH), evolution_conversations (HIGH)
--   contacts-import       → evolution_contacts (HIGH)
--   lgpd-scheduled-jobs   → evolution_contacts, evolution_webhook_events,
--                           contact_audit_log, system_settings
--   gmail-token-refresh   → evolution_alerts (MEDIUM)
--   nps-scheduler         → nps_invitations (MEDIUM)
--   instance-pause-control → instance_auth_events (MEDIUM)
--   evolution-health      → system_logs (LOW — already in try/catch)
--   email-track-pixel     → email_tracked_messages (table doesn't exist — create it)
--
-- Views skipped (already exist as physical tables in zapp):
--   contact_export_log    — confirmed in zapp (referenced by hardening v6 ALTER TABLE)
--   migration_audit       — created in zapp by 20260715_create_missing_schema_objects.sql

-- ── 1. evolution_contacts  (evo → zapp) ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_contacts'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.evolution_contacts
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_contacts
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.evolution_contacts FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL    ON zapp.evolution_contacts TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_contacts TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.evolution_contacts VIEW created';
  ELSE
    RAISE NOTICE 'zapp.evolution_contacts already exists — skipping';
  END IF;
END;
$$;

-- ── 2. evolution_conversations  (evo → zapp) ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_conversations'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.evolution_conversations
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_conversations
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.evolution_conversations FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.evolution_conversations TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_conversations TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.evolution_conversations VIEW created';
  ELSE
    RAISE NOTICE 'zapp.evolution_conversations already exists — skipping';
  END IF;
END;
$$;

-- ── 3. evolution_alerts  (evo → zapp) ────────────────────────────────────────
-- Used by gmail-token-refresh to log auth failures.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_alerts'
  ) THEN
    -- Ensure source table exists in evo before creating proxy
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'evo' AND c.relname = 'evolution_alerts'
    ) THEN
      EXECUTE $sql$
        CREATE VIEW zapp.evolution_alerts
          WITH (security_invoker = on)
        AS SELECT * FROM evo.evolution_alerts
      $sql$;

      EXECUTE $sql$
        REVOKE ALL ON zapp.evolution_alerts FROM PUBLIC, anon
      $sql$;
      EXECUTE $sql$
        GRANT ALL ON zapp.evolution_alerts TO service_role
      $sql$;
      EXECUTE $sql$
        GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_alerts TO authenticated
      $sql$;

      RAISE NOTICE 'zapp.evolution_alerts VIEW created';
    ELSE
      -- Source table missing: create it directly in evo then proxy
      EXECUTE $sql$
        CREATE TABLE IF NOT EXISTS evo.evolution_alerts (
          id          BIGSERIAL PRIMARY KEY,
          instance    TEXT        NOT NULL,
          alert_type  TEXT        NOT NULL,
          severity    TEXT        NOT NULL DEFAULT 'info',
          message     TEXT,
          metadata    JSONB,
          resolved    BOOLEAN     NOT NULL DEFAULT false,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      $sql$;

      EXECUTE $sql$
        CREATE VIEW zapp.evolution_alerts
          WITH (security_invoker = on)
        AS SELECT * FROM evo.evolution_alerts
      $sql$;

      EXECUTE $sql$
        REVOKE ALL ON zapp.evolution_alerts FROM PUBLIC, anon
      $sql$;
      EXECUTE $sql$
        GRANT ALL ON zapp.evolution_alerts TO service_role
      $sql$;
      EXECUTE $sql$
        GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_alerts TO authenticated
      $sql$;

      RAISE NOTICE 'evo.evolution_alerts TABLE + zapp.evolution_alerts VIEW created';
    END IF;
  ELSE
    RAISE NOTICE 'zapp.evolution_alerts already exists — skipping';
  END IF;
END;
$$;

-- ── 4. evolution_webhook_events  (evo → zapp) ────────────────────────────────
-- Used by lgpd-scheduled-jobs to prune old webhook events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_webhook_events'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.evolution_webhook_events
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_webhook_events
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.evolution_webhook_events FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.evolution_webhook_events TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_webhook_events TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.evolution_webhook_events VIEW created';
  ELSE
    RAISE NOTICE 'zapp.evolution_webhook_events already exists — skipping';
  END IF;
END;
$$;

-- ── 5. nps_invitations  (public → zapp) ──────────────────────────────────────
-- Used by nps-scheduler to manage NPS survey invitations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'nps_invitations'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.nps_invitations
        WITH (security_invoker = on)
      AS SELECT * FROM public.nps_invitations
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.nps_invitations FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.nps_invitations TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.nps_invitations TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.nps_invitations VIEW created';
  ELSE
    RAISE NOTICE 'zapp.nps_invitations already exists — skipping';
  END IF;
END;
$$;

-- ── 6. instance_auth_events  (public → zapp) ─────────────────────────────────
-- Used by instance-pause-control to track auth attempts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'instance_auth_events'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.instance_auth_events
        WITH (security_invoker = on)
      AS SELECT * FROM public.instance_auth_events
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.instance_auth_events FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.instance_auth_events TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON zapp.instance_auth_events TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.instance_auth_events VIEW created';
  ELSE
    RAISE NOTICE 'zapp.instance_auth_events already exists — skipping';
  END IF;
END;
$$;

-- ── 7. contact_audit_log  (public → zapp, idempotent) ────────────────────────
-- Used by lgpd-scheduled-jobs to write LGPD audit trail.
-- May already exist in zapp if moved by an unindexed mechanism.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'contact_audit_log'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.contact_audit_log
        WITH (security_invoker = on)
      AS SELECT * FROM public.contact_audit_log
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.contact_audit_log FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.contact_audit_log TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON zapp.contact_audit_log TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.contact_audit_log VIEW created';
  ELSE
    RAISE NOTICE 'zapp.contact_audit_log already exists — skipping';
  END IF;
END;
$$;

-- ── 8. system_settings  (public → zapp) ──────────────────────────────────────
-- Used by lgpd-scheduled-jobs to read LGPD retention configuration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'system_settings'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW zapp.system_settings
        WITH (security_invoker = on)
      AS SELECT * FROM public.system_settings
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.system_settings FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.system_settings TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON zapp.system_settings TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.system_settings VIEW created';
  ELSE
    RAISE NOTICE 'zapp.system_settings already exists — skipping';
  END IF;
END;
$$;

-- ── 9. system_logs  (public → zapp) ──────────────────────────────────────────
-- Used by evolution-health (wrapped in try/catch — low severity).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'system_logs'
  ) THEN
    -- system_logs may or may not exist in public; create table if needed
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'system_logs'
        AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE $sql$
        CREATE VIEW zapp.system_logs
          WITH (security_invoker = on)
        AS SELECT * FROM public.system_logs
      $sql$;

      RAISE NOTICE 'zapp.system_logs VIEW created (proxying public.system_logs)';
    ELSE
      -- Create a minimal system_logs table directly in zapp
      EXECUTE $sql$
        CREATE TABLE zapp.system_logs (
          id          BIGSERIAL    PRIMARY KEY,
          level       TEXT         NOT NULL DEFAULT 'info',
          source      TEXT,
          message     TEXT         NOT NULL,
          metadata    JSONB,
          created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
      $sql$;

      RAISE NOTICE 'zapp.system_logs TABLE created (no public source found)';
    END IF;

    EXECUTE $sql$
      REVOKE ALL ON zapp.system_logs FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.system_logs TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON zapp.system_logs TO authenticated
    $sql$;
  ELSE
    RAISE NOTICE 'zapp.system_logs already exists — skipping';
  END IF;
END;
$$;

-- ── 10. email_tracked_messages  (create in zapp — no source table exists) ─────
-- Used by email-track-pixel to log email open events.
-- No CREATE TABLE found in any migration; create it directly in zapp.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'email_tracked_messages'
  ) THEN
    EXECUTE $sql$
      CREATE TABLE zapp.email_tracked_messages (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_id     TEXT         NOT NULL UNIQUE,
        sender_email    TEXT         NOT NULL,
        recipient_email TEXT,
        subject         TEXT,
        campaign_id     UUID,
        sent_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        opened_at       TIMESTAMPTZ,
        open_count      INTEGER      NOT NULL DEFAULT 0,
        last_open_ip    TEXT,
        last_open_ua    TEXT,
        metadata        JSONB,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    $sql$;

    EXECUTE $sql$
      CREATE INDEX idx_email_tracked_messages_tracking_id
        ON zapp.email_tracked_messages (tracking_id)
    $sql$;
    EXECUTE $sql$
      CREATE INDEX idx_email_tracked_messages_sender
        ON zapp.email_tracked_messages (sender_email)
    $sql$;
    EXECUTE $sql$
      CREATE INDEX idx_email_tracked_messages_campaign
        ON zapp.email_tracked_messages (campaign_id)
        WHERE campaign_id IS NOT NULL
    $sql$;

    -- Enable RLS
    EXECUTE $sql$
      ALTER TABLE zapp.email_tracked_messages ENABLE ROW LEVEL SECURITY
    $sql$;

    -- Service role full access
    EXECUTE $sql$
      CREATE POLICY "service_role_full_access_email_tracked_messages"
        ON zapp.email_tracked_messages FOR ALL
        TO service_role USING (true) WITH CHECK (true)
    $sql$;

    -- Authenticated users can view messages linked to their sender email
    EXECUTE $sql$
      CREATE POLICY "authenticated_select_own_email_tracked_messages"
        ON zapp.email_tracked_messages FOR SELECT
        TO authenticated
        USING (
          sender_email = (
            SELECT email FROM auth.users WHERE id = auth.uid()
          )
        )
    $sql$;

    EXECUTE $sql$
      REVOKE ALL ON zapp.email_tracked_messages FROM PUBLIC, anon
    $sql$;
    EXECUTE $sql$
      GRANT ALL ON zapp.email_tracked_messages TO service_role
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON zapp.email_tracked_messages TO authenticated
    $sql$;

    RAISE NOTICE 'zapp.email_tracked_messages TABLE created';
  ELSE
    RAISE NOTICE 'zapp.email_tracked_messages already exists — skipping';
  END IF;
END;
$$;

-- ── 11. rpc_email_register_open  (zapp → RPC for tracking pixel) ─────────────
-- Used by email-track-pixel/index.ts:107 — `supabase.rpc('rpc_email_register_open', {...})`
-- Creates the RPC that increments open_count and records open metadata.
CREATE OR REPLACE FUNCTION zapp.rpc_email_register_open(
  p_tracking_id   TEXT,
  p_ip_address    TEXT DEFAULT NULL,
  p_user_agent    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_record  zapp.email_tracked_messages%ROWTYPE;
BEGIN
  UPDATE zapp.email_tracked_messages
  SET
    open_count   = open_count + 1,
    opened_at    = COALESCE(opened_at, now()),
    last_open_ip = COALESCE(p_ip_address, last_open_ip),
    last_open_ua = COALESCE(p_user_agent, last_open_ua),
    updated_at   = now()
  WHERE tracking_id = p_tracking_id
  RETURNING * INTO v_record;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'tracking_id', p_tracking_id);
  END IF;

  RETURN jsonb_build_object(
    'found',       true,
    'tracking_id', v_record.tracking_id,
    'open_count',  v_record.open_count,
    'opened_at',   v_record.opened_at
  );
END;
$$;

REVOKE ALL     ON FUNCTION zapp.rpc_email_register_open(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_register_open(TEXT, TEXT, TEXT) TO service_role;
