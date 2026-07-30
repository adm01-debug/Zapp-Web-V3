-- Schema Hardening v8: CHECK constraints on 5 remaining status-like columns
-- Covers: instance_registry.connection_status, integration_registry.health_status,
-- whatsapp_connections.health_status, supabase_projects.health_status,
-- chunks.embedding_status.
--
-- Excluded (intentionally unconstrained):
--   _consumer_dlq.last_status — diagnostic snapshot of prior status, mirrors
--     whatever value the original status column held before DLQ ingestion.
--   agent_presence.status_message — free-text user-visible message, not categorical.
--
-- All values verified against app code (connectionsRepository.ts, useKnowledgeBase.ts,
-- useMonitoringManagement.ts) and live data (SELECT DISTINCT on 2026-07-17).
-- Idempotent DO blocks per Rule M2.
-- NOT VALID + VALIDATE CONSTRAINT per Rule M4 (no write blocking).

-- ============================================================
-- FIX #20: instance_registry.connection_status
-- App types: 'connected' | 'disconnected' | 'qr_pending' | 'error'
-- Live data: only 'disconnected' (23 rows)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instance_registry_connection_status_check') THEN
    ALTER TABLE zapp.instance_registry
      ADD CONSTRAINT instance_registry_connection_status_check
      CHECK (connection_status IS NULL OR connection_status IN ('connected', 'disconnected', 'qr_pending', 'error')) NOT VALID;
  END IF;
END $$;

-- ============================================================
-- FIX #21: integration_registry.health_status
-- Live data: 'active' (2), 'healthy' (17), 'warning' (1)
-- Extended with 'degraded', 'unhealthy', 'unknown' for future states
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_registry_health_status_check') THEN
    ALTER TABLE zapp.integration_registry
      ADD CONSTRAINT integration_registry_health_status_check
      CHECK (health_status IS NULL OR health_status IN ('healthy', 'active', 'warning', 'degraded', 'unhealthy', 'unknown')) NOT VALID;
  END IF;
END $$;

-- ============================================================
-- FIX #22: whatsapp_connections.health_status
-- Live data: 'healthy' (1), 'ok' (1), 'provisioned' (1)
-- Extended with 'degraded', 'error', 'unknown' for completeness
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_connections_health_status_check') THEN
    ALTER TABLE zapp.whatsapp_connections
      ADD CONSTRAINT whatsapp_connections_health_status_check
      CHECK (health_status IS NULL OR health_status IN ('healthy', 'ok', 'provisioned', 'degraded', 'error', 'unknown')) NOT VALID;
  END IF;
END $$;

-- ============================================================
-- FIX #23: supabase_projects.health_status
-- No live data yet (0 rows with non-null health_status)
-- Default is 'unknown'; mirror whatsapp_connections pattern
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supabase_projects_health_status_check') THEN
    ALTER TABLE zapp.supabase_projects
      ADD CONSTRAINT supabase_projects_health_status_check
      CHECK (health_status IS NULL OR health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')) NOT VALID;
  END IF;
END $$;

-- ============================================================
-- FIX #24: chunks.embedding_status
-- Default is 'pending'; typical embedding pipeline states
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chunks_embedding_status_check') THEN
    ALTER TABLE zapp.chunks
      ADD CONSTRAINT chunks_embedding_status_check
      CHECK (embedding_status IS NULL OR embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')) NOT VALID;
  END IF;
END $$;

-- Validate all new constraints
ALTER TABLE zapp.instance_registry VALIDATE CONSTRAINT instance_registry_connection_status_check;
ALTER TABLE zapp.integration_registry VALIDATE CONSTRAINT integration_registry_health_status_check;
ALTER TABLE zapp.whatsapp_connections VALIDATE CONSTRAINT whatsapp_connections_health_status_check;
ALTER TABLE zapp.supabase_projects VALIDATE CONSTRAINT supabase_projects_health_status_check;
ALTER TABLE zapp.chunks VALIDATE CONSTRAINT chunks_embedding_status_check;
