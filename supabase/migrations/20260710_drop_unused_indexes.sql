-- Migration: drop_unused_indexes_20260710
-- Date: 2026-07-10
-- Author: automated hardening v6.2
-- Space freed: ~19 MB
-- Criteria: idx_scan=0 AND idx_tup_read=0 over 70h uptime with organic WA traffic
--           No backing constraint/FK (pg_constraint check confirmed 0 rows)
--           Partition-dependent indexes (3) kept to avoid cascade on parent index

-- Already executed on production via MCP (Supabase Self Hosted)
-- This file documents what was dropped for version control and rollback reference

-- DROPPED (12 indexes, ~19 MB):
-- DROP INDEX zapp.idx_wep_event_type_processed;     -- 5784 kB, 0 scans
-- DROP INDEX zapp.idx_wep_instance_event;            -- 912 kB, 0 scans
-- DROP INDEX zapp.idx_notif_user;                    -- 4256 kB, 0 scans
-- DROP INDEX evo.idx_msgs_wpp2_jid_active;           -- 2472 kB, 0 scans
-- DROP INDEX evo.idx_contacts_full_name_trgm;        -- 1328 kB, 0 scans
-- DROP INDEX evo.idx_contacts_phone_trgm;            -- 1184 kB, 0 scans
-- DROP INDEX evo.idx_contacts_lead_status;           -- 832 kB, 0 scans
-- DROP INDEX evo.idx_evo_contacts_phone_number;      -- 624 kB, 0 scans
-- DROP INDEX evo.idx_contacts_active_lastmsg;        -- 576 kB, 0 scans
-- DROP INDEX public.idx_empresas_created_at;         -- 1152 kB, 0 scans
-- DROP INDEX public.idx_empresas_bitrix_id;          -- 1152 kB, 0 scans
-- (first drop ran separately): idx_wep_event_type_processed → included above

-- KEPT (3 indexes — partition-backing dependency, cannot drop child independently):
-- evo.idx_messages_wpp2_conversation_timeline  (parent: idx_evo_msgs_conv_timeline)
-- evo.evolution_messages_wpp2_to_tsvector_idx  (parent: idx_messages_content_search)
-- evo.idx_conv_wpp2_contact                   (parent: idx_evolution_conversations_contact_id)

-- ROLLBACK: Recreate individually as needed. Partition-backed indexes are
-- auto-recreated when the parent partition index is recreated.

-- VERIFY POST-MIGRATION:
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_wep_event_type_processed','idx_wep_instance_event','idx_notif_user',
  'idx_msgs_wpp2_jid_active','idx_contacts_full_name_trgm','idx_contacts_phone_trgm',
  'idx_contacts_lead_status','idx_evo_contacts_phone_number','idx_contacts_active_lastmsg',
  'idx_empresas_created_at','idx_empresas_bitrix_id'
);
-- Expected: 0 rows (all dropped)
