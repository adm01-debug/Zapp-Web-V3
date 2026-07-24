-- Evolution API Audit 2026-07-24: Drop unused indexes in evo schema
-- Audit source: pg_stat_user_indexes WHERE idx_scan = 0 (since last restart 2026-07-22)
-- Estimated space recovered: ~22 MB across evo schema
--
-- Design note: partitioned table child indexes cannot be dropped independently while
-- their root parent index exists. The correct approach is to drop the root index,
-- which cascades to all partition children automatically. Root indexes with 0 total
-- scans across ALL children are safe to drop.
--
-- Root indexes dropped (cascade to all children):
--   evo_whk_v2_remote_jid                    — 0 scans, 17 children (webhook partitions)
--   pidx_msgs_unread_contact                  — 0 scans, 23 children (message partitions)
--   idx_evolution_conversations_contact_id    — 0 scans, 23 children (conversation partitions)
--   idx_evolution_conversations_status_assigned — 0 scans, 23 children (conversation partitions)
--   idx_evo_msgs_conv_timeline                — 1 scan total (essentially unused), 23 children
--
-- Root indexes KEPT (active):
--   idx_evo_msgs_remote_jid_created   — 1,457 scans
--   idx_evo_convs_jid                 — 9,595 scans
--   idx_msgs_orphan_conv              — 10,389 scans
--   idx_evo_msgs_instance_created     — 27,879 scans

SET search_path TO evo;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: Unused ROOT indexes (cascade drops all partition children)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Webhook remote_jid index: 0 scans across 17 partition children
DROP INDEX IF EXISTS evo_whk_v2_remote_jid;

-- Unread-contact message index: 0 scans across 23 partition children
DROP INDEX IF EXISTS pidx_msgs_unread_contact;

-- Conversation contact_id index: 0 scans across 23 partition children
DROP INDEX IF EXISTS idx_evolution_conversations_contact_id;

-- Conversation status+assigned index: 0 scans across 23 partition children
DROP INDEX IF EXISTS idx_evolution_conversations_status_assigned;

-- Conversation timeline index: 1 scan total across 23 children (effectively unused)
DROP INDEX IF EXISTS idx_evo_msgs_conv_timeline;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: Standalone (non-partitioned or orphan) indexes — 0 scans
-- These have no root parent and can be dropped directly.
-- ═══════════════════════════════════════════════════════════════════════════════

-- evolution_contacts: over-engineered composite/PII indexes
DROP INDEX IF EXISTS idx_ec_pii_masked_null;
DROP INDEX IF EXISTS idx_evo_contacts_composite_search;
DROP INDEX IF EXISTS idx_evo_contacts_phone_active;
DROP INDEX IF EXISTS idx_evo_contacts_fullname_lower_active;
DROP INDEX IF EXISTS idx_contacts_score;
DROP INDEX IF EXISTS idx_contacts_nickname_trgm;
DROP INDEX IF EXISTS idx_contacts_first_name_trgm;
DROP INDEX IF EXISTS idx_contacts_job_title_trgm;
DROP INDEX IF EXISTS idx_ec_pii_masked_not_null;
DROP INDEX IF EXISTS idx_evolution_contacts_dedup_hash;

-- evolution_whatsapp_status — all unused
DROP INDEX IF EXISTS idx_wstatus_viewed_expires;
DROP INDEX IF EXISTS idx_wstatus_expires_at;
DROP INDEX IF EXISTS idx_wstatus_posted;
DROP INDEX IF EXISTS idx_wstatus_instance;
DROP INDEX IF EXISTS idx_wstatus_participant;

-- evolution_conversations_wpp2 — unused agent_queue index
DROP INDEX IF EXISTS idx_conv_wpp2_agent_queue;

-- evolution_conversations_marketing — unused
DROP INDEX IF EXISTS idx_conv_marketing_status;
DROP INDEX IF EXISTS idx_conv_marketing_contact;

-- evolution_messages_wpp2_archive — unused
DROP INDEX IF EXISTS evolution_messages_wpp2_archive_follow_up_at_idx;
DROP INDEX IF EXISTS evolution_messages_wpp2_archive_created_at_idx1;

-- ─── Per-partition media_meta indexes (never used) ───────────────────────────
DROP INDEX IF EXISTS idx_msgs_artes_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial04_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial05_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial08_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial09_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial11_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial12_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial13_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial14_media_meta;
DROP INDEX IF EXISTS idx_msgs_comercial15_media_meta;
DROP INDEX IF EXISTS idx_msgs_compras_media_meta;
DROP INDEX IF EXISTS idx_msgs_financeiro_media_meta;
DROP INDEX IF EXISTS idx_msgs_gravacao_media_meta;
DROP INDEX IF EXISTS idx_msgs_logistica_media_meta;

-- ─── evolution_deals (0 rows) ────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_deal_value;
DROP INDEX IF EXISTS idx_deals_active_pipeline;
DROP INDEX IF EXISTS idx_deals_assigned;
DROP INDEX IF EXISTS idx_deals_expected_close;
DROP INDEX IF EXISTS idx_deals_stage;

-- ─── evolution_reactions ─────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_reactions_message;
DROP INDEX IF EXISTS idx_reactions_jid;
DROP INDEX IF EXISTS idx_reactions_emoji;
DROP INDEX IF EXISTS idx_reactions_created;

-- ─── evolution_calls ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_calls_created;
DROP INDEX IF EXISTS idx_calls_missed;
DROP INDEX IF EXISTS idx_calls_remote_jid;
DROP INDEX IF EXISTS idx_fk_evolution_calls_contact_id;

-- ─── evolution_followups ─────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_followups_deal_type_status;
DROP INDEX IF EXISTS idx_followups_scheduled_pending;

-- ─── evolution_bitrix_queue (Bitrix integration not active) ──────────────────
DROP INDEX IF EXISTS idx_bitrix_queue_local_id_status;
DROP INDEX IF EXISTS idx_bitrix_queue_worker;
DROP INDEX IF EXISTS idx_bitrix_queue_entity;

-- ─── evolution_status_auto_rules / evolution_status_reactions (0 rows) ────────
DROP INDEX IF EXISTS idx_srules_active;
DROP INDEX IF EXISTS idx_sreact_status;
DROP INDEX IF EXISTS idx_sreact_unsent;
DROP INDEX IF EXISTS idx_sreact_rule;

-- ─── evolution_incident_runbook (0 rows) ─────────────────────────────────────
DROP INDEX IF EXISTS idx_evo_incident_runbook_severity;
DROP INDEX IF EXISTS idx_evo_incident_runbook_category;

-- ─── evolution_media ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_evo_media_stickers;
DROP INDEX IF EXISTS idx_evo_media_animated;

-- ─── evolution_health_logs ───────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_evo_health_failures;

-- ─── evolution_instance_credentials ─────────────────────────────────────────
DROP INDEX IF EXISTS idx_evo_creds_health;

-- ─── evolution_ip_watch ──────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_evo_ip_watch_ip_ts;
