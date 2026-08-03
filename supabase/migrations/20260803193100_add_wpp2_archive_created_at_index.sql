-- Migration: Add created_at DESC index to evolution_messages_wpp2_archive partition
-- Date: 2026-08-03
-- Context: The zapp.messages view UNIONs all partitions. wpp2_archive was missing
--          the created_at DESC index present on all other partitions, causing
--          potential seq scans on archived message queries.
-- Applied in production via CREATE INDEX CONCURRENTLY 2026-08-03.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_wpp2_archive_created_at
  ON evo.evolution_messages_wpp2_archive (created_at DESC);

-- ROLLBACK:
-- DROP INDEX CONCURRENTLY IF EXISTS evo.idx_messages_wpp2_archive_created_at;
