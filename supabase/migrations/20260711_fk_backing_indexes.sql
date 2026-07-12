-- Migration: fk_backing_indexes_20260711
-- Date: 2026-07-11
-- Author: automated improvement — FK without backing index scan (SIM_02)
--
-- Problem: 20 foreign keys without backing indexes in zapp/public schemas.
-- PostgreSQL must seq-scan the child table on every DELETE/UPDATE of parent rows.
-- Most critical: zapp.app_notifications has 11 MB of rows referenced by user_id FK.
--
-- Created 8 indexes covering the highest-impact FK columns:
-- (selection criteria: table_bytes > 40kB AND parent_rows > 10)

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_id
  ON zapp.app_notifications(user_id);
-- 11 MB child table, parent=profiles (18 rows) → ON DELETE must scan 11MB without index

CREATE INDEX IF NOT EXISTS idx_conversation_events_contact_id
  ON zapp.conversation_events(contact_id);
-- contact table has 20438 rows; CASCADE checks expensive without index

CREATE INDEX IF NOT EXISTS idx_calls_contact_id
  ON zapp.calls(contact_id);

CREATE INDEX IF NOT EXISTS idx_calls_agent_id
  ON zapp.calls(agent_id);

CREATE INDEX IF NOT EXISTS idx_conversation_transfers_contact_id
  ON zapp.conversation_transfers(contact_id);

CREATE INDEX IF NOT EXISTS idx_sla_rules_contact_id
  ON zapp.sla_rules(contact_id);

CREATE INDEX IF NOT EXISTS idx_instance_registry_owner_id
  ON zapp.instance_registry(owner_id);

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
  ON public.profiles(department_id);

-- Not indexed (not worth it): tables < 40kB or parent_rows=0 or audit-only FK columns
-- (dismissed_by, reviewed_by, created_by — rarely joined, small tables)
