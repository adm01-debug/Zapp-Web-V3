-- Evolution API Audit 2026-07-24: Drop 400+ unused indexes in evo schema
-- Audit source: pg_stat_user_indexes WHERE idx_scan = 0 (since last restart)
-- Estimated space recovered: ~22 MB across evo schema
--
-- Methodology:
--   - Only non-unique indexes (unique indexes skipped by query filter)
--   - Only indexes with times_used = 0 since last PostgreSQL restart (2026-07-22)
--   - GIN full-text indexes on message partitions: never used (text search not deployed)
--   - Large composite indexes on contacts: shadowed by narrower indexes actually used
--   - Partition-level duplicates: query planner routes via root indexes
--
-- IMPORTANT: For zero-downtime on a live system, run each DROP as:
--   DROP INDEX CONCURRENTLY evo.<index_name>;
-- The migration file uses regular DROP (transaction-safe) since partitions are tiny.

SET search_path TO evo;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: LARGE UNUSED INDEXES (≥100 kB) — High priority, significant savings
-- ═══════════════════════════════════════════════════════════════════════════════

-- evolution_webhook_events_v2_2026_07 — 1,904 kB, never queried by remote_jid
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_07_remote_jid_created_at_idx;

-- evolution_messages_wpp2 GIN full-text — 1,576 kB, text search not deployed
DROP INDEX IF EXISTS evolution_messages_wpp2_to_tsvector_idx;

-- evolution_contacts: over-engineered composite search indexes
DROP INDEX IF EXISTS idx_ec_pii_masked_null;                    -- 824 kB, PII masking scan
DROP INDEX IF EXISTS idx_evo_contacts_composite_search;         -- 808 kB, superseded by narrower idx
DROP INDEX IF EXISTS idx_evo_contacts_phone_active;             -- 632 kB
DROP INDEX IF EXISTS idx_evo_contacts_fullname_lower_active;    -- 440 kB
DROP INDEX IF EXISTS idx_contacts_score;                        -- 304 kB
DROP INDEX IF EXISTS idx_contacts_nickname_trgm;                -- 128 kB (GIN trigram)
DROP INDEX IF EXISTS idx_contacts_first_name_trgm;             -- 128 kB (GIN trigram)
DROP INDEX IF EXISTS idx_wstatus_participant;                    -- 128 kB (whatsapp_status)
DROP INDEX IF EXISTS idx_contacts_job_title_trgm;               -- 80 kB (GIN trigram)

-- evolution_conversations_wpp2
DROP INDEX IF EXISTS idx_conv_wpp2_contact;                     -- 592 kB
DROP INDEX IF EXISTS idx_conv_wpp2_agent_queue;                 -- 8 kB

-- evolution_messages_wpp2 — active partition secondary indexes
DROP INDEX IF EXISTS idx_wpp2_msgs_unread_contact;              -- 568 kB
DROP INDEX IF EXISTS evolution_messages_wpp2_deleted_at_idx;    -- 16 kB
DROP INDEX IF EXISTS evolution_messages_wpp2_reply_to_id_idx;   -- 8 kB
DROP INDEX IF EXISTS idx_msgs_wpp2_followup_pending;            -- 8 kB
DROP INDEX IF EXISTS idx_msgs_wpp2_starred;                     -- 8 kB

-- evolution_whatsapp_status — all unused
DROP INDEX IF EXISTS idx_wstatus_viewed_expires;                -- 448 kB
DROP INDEX IF EXISTS idx_wstatus_expires_at;                    -- 336 kB
DROP INDEX IF EXISTS idx_wstatus_posted;                        -- 336 kB
DROP INDEX IF EXISTS idx_wstatus_instance;                      -- 120 kB

-- evolution_contacts — remaining small unused
DROP INDEX IF EXISTS idx_ec_pii_masked_not_null;                -- 8 kB
DROP INDEX IF EXISTS idx_evolution_contacts_dedup_hash;         -- 8 kB (0 trigger hits)

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: MESSAGE PARTITION GIN FULL-TEXT INDEXES (never used)
-- Full-text search via tsvector is not implemented in the application layer
-- ═══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS evolution_messages_logistica_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_06_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_07_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_09_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_10_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_11_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_12_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_13_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_14_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_financeiro_to_tsvector_idx;
DROP INDEX IF EXISTS evolution_messages_compras_to_tsvector_idx;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: MESSAGE PARTITION — remote_jid + instance_name redundant indexes
-- These are per-partition copies of root table indexes; planner uses root indexes
-- ═══════════════════════════════════════════════════════════════════════════════

-- evolution_messages_comercial_01
DROP INDEX IF EXISTS evolution_messages_comercial_01_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_01_instance_name_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_01_id_idx;

-- evolution_messages_comercial_03
DROP INDEX IF EXISTS idx_conv_tl_comercial_03;

-- evolution_messages_comercial_04
DROP INDEX IF EXISTS evolution_messages_comercial_04_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_04_instance_name_created_at_idx;

-- evolution_messages_comercial_05
DROP INDEX IF EXISTS evolution_messages_comercial_05_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_05_instance_name_created_at_idx;

-- evolution_messages_comercial_06
DROP INDEX IF EXISTS evolution_messages_comercial_06_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_06_instance_name_created_at_idx;

-- evolution_messages_comercial_07
DROP INDEX IF EXISTS evolution_messages_comercial_07_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_07_instance_name_created_at_idx;

-- evolution_messages_comercial_08
DROP INDEX IF EXISTS evolution_messages_comercial_08_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_08_instance_name_created_at_idx;

-- evolution_messages_comercial_09
DROP INDEX IF EXISTS evolution_messages_comercial_09_to_tsvector_idx;

-- evolution_messages_comercial_10
DROP INDEX IF EXISTS evolution_messages_comercial_10_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_10_instance_name_created_at_idx;

-- evolution_messages_comercial_11
DROP INDEX IF EXISTS evolution_messages_comercial_11_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_11_instance_name_created_at_idx;

-- evolution_messages_comercial_12
DROP INDEX IF EXISTS evolution_messages_comercial_12_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_12_instance_name_created_at_idx;

-- evolution_messages_comercial_14
DROP INDEX IF EXISTS evolution_messages_comercial_14_remote_jid_created_at_idx;

-- evolution_messages_logistica
DROP INDEX IF EXISTS evolution_messages_logistica_instance_name_created_at_idx;

-- evolution_messages_default
DROP INDEX IF EXISTS evolution_messages_default_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_default_instance_name_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_default_id_idx;
DROP INDEX IF EXISTS idx_conv_tl_default;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_default;

-- evolution_messages_financeiro
DROP INDEX IF EXISTS idx_financeiro_rjid;
DROP INDEX IF EXISTS evolution_messages_financeiro_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_financeiro_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_financeiro_instance_name_created_at_idx;

-- evolution_messages_compras
DROP INDEX IF EXISTS idx_compras_rjid;
DROP INDEX IF EXISTS evolution_messages_compras_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_compras_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_messages_compras_instance_name_created_at_idx;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: MESSAGE PARTITION — small per-partition indexes (all 8 kB, never used)
-- Pattern: _deleted_at_idx, _id_idx, _reply_to_id_idx, pidx_msgs_*
-- ═══════════════════════════════════════════════════════════════════════════════

-- evolution_messages_comercial_04
DROP INDEX IF EXISTS evolution_messages_comercial_04_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_04_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial04_media_meta;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_04;
DROP INDEX IF EXISTS evolution_messages_comercial_04_reply_to_id_idx;
DROP INDEX IF EXISTS idx_conv_tl_comercial_04;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_04;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_04;

-- evolution_messages_comercial_05
DROP INDEX IF EXISTS evolution_messages_comercial_05_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_05_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial05_media_meta;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_05;
DROP INDEX IF EXISTS idx_conv_tl_comercial_05;
DROP INDEX IF EXISTS evolution_messages_comercial_05_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_05;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_05;

-- evolution_messages_comercial_08
DROP INDEX IF EXISTS evolution_messages_comercial_08_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_08_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial08_media_meta;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_08;
DROP INDEX IF EXISTS idx_conv_tl_comercial_08;
DROP INDEX IF EXISTS evolution_messages_comercial_08_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_08;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_08;

-- evolution_messages_comercial_09
DROP INDEX IF EXISTS evolution_messages_comercial_09_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_09_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial09_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_comercial_09;
DROP INDEX IF EXISTS evolution_messages_comercial_09_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_09;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_09;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_09;

-- evolution_messages_comercial_11
DROP INDEX IF EXISTS idx_msgs_comercial11_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_comercial_11;
DROP INDEX IF EXISTS evolution_messages_comercial_11_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_11;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_11;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_11;

-- evolution_messages_comercial_12
DROP INDEX IF EXISTS evolution_messages_comercial_12_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_12_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial12_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_comercial_12;
DROP INDEX IF EXISTS evolution_messages_comercial_12_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_12;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_12;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_12;

-- evolution_messages_comercial_13
DROP INDEX IF EXISTS evolution_messages_comercial_13_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_13_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial13_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_comercial_13;
DROP INDEX IF EXISTS evolution_messages_comercial_13_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_13;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_13;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_13;

-- evolution_messages_comercial_14
DROP INDEX IF EXISTS evolution_messages_comercial_14_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_14_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial14_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_comercial_14;
DROP INDEX IF EXISTS evolution_messages_comercial_14_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_14;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_14;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_14;

-- evolution_messages_comercial_15
DROP INDEX IF EXISTS evolution_messages_comercial_15_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_comercial_15_id_idx;
DROP INDEX IF EXISTS idx_msgs_comercial15_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_comercial_15;
DROP INDEX IF EXISTS evolution_messages_comercial_15_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_comercial_15;
DROP INDEX IF EXISTS pidx_msgs_starred_comercial_15;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_comercial_15;

-- evolution_messages_artes
DROP INDEX IF EXISTS evolution_messages_artes_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_artes_id_idx;
DROP INDEX IF EXISTS idx_msgs_artes_media_meta;
DROP INDEX IF EXISTS evolution_messages_artes_reply_to_id_idx;
DROP INDEX IF EXISTS idx_conv_tl_artes;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_artes;
DROP INDEX IF EXISTS pidx_msgs_starred_artes;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_artes;

-- evolution_messages_logistica
DROP INDEX IF EXISTS evolution_messages_logistica_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_logistica_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_logistica;
DROP INDEX IF EXISTS idx_msgs_logistica_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_logistica;
DROP INDEX IF EXISTS evolution_messages_logistica_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_starred_logistica;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_logistica;

-- evolution_messages_financeiro
DROP INDEX IF EXISTS evolution_messages_financeiro_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_financeiro;
DROP INDEX IF EXISTS idx_msgs_financeiro_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_financeiro;
DROP INDEX IF EXISTS evolution_messages_financeiro_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_starred_financeiro;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_financeiro;

-- evolution_messages_compras
DROP INDEX IF EXISTS evolution_messages_compras_id_idx;
DROP INDEX IF EXISTS pidx_msgs_followup_pending_compras;
DROP INDEX IF EXISTS idx_msgs_compras_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_compras;
DROP INDEX IF EXISTS evolution_messages_compras_reply_to_id_idx;
DROP INDEX IF EXISTS pidx_msgs_starred_compras;
DROP INDEX IF EXISTS pidx_msgs_unread_contact_compras;

-- evolution_messages_default
DROP INDEX IF EXISTS pidx_msgs_followup_pending_default;
DROP INDEX IF EXISTS evolution_messages_default_reply_to_id_idx;
DROP INDEX IF EXISTS evolution_messages_default_deleted_at_idx;
DROP INDEX IF EXISTS pidx_msgs_starred_default;

-- evolution_messages_gravacao
DROP INDEX IF EXISTS evolution_messages_gravacao_deleted_at_idx;
DROP INDEX IF EXISTS evolution_messages_gravacao_id_idx;
DROP INDEX IF EXISTS idx_msgs_gravacao_media_meta;
DROP INDEX IF EXISTS idx_conv_tl_gravacao;
DROP INDEX IF EXISTS evolution_messages_gravacao_reply_to_id_idx;

-- evolution_messages_wpp2_archive
DROP INDEX IF EXISTS evolution_messages_wpp2_archive_follow_up_at_idx;
DROP INDEX IF EXISTS evolution_messages_wpp2_archive_created_at_idx1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: CONVERSATION PARTITION — unused contact_id and status indexes
-- ═══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS evolution_conversations_comercial_01_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_01_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_01_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_02_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_02_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_03_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_04_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_04_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_05_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_05_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_05_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_06_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_06_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_07_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_07_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_09_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_09_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_10_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_10_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_11_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_11_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_11_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_12_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_12_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_12_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_13_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_13_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_13_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_14_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_14_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_14_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_comercial_15_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_15_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_comercial_15_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_gravacao_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_gravacao_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_gravacao_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_artes_remote_jid_idx;
DROP INDEX IF EXISTS evolution_conversations_artes_contact_id_idx;
DROP INDEX IF EXISTS evolution_conversations_artes_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_marketing_remote_jid_idx;
DROP INDEX IF EXISTS idx_conv_marketing_status;
DROP INDEX IF EXISTS idx_conv_marketing_contact;

DROP INDEX IF EXISTS evolution_conversations_financeiro_status_assigned_to_idx;
DROP INDEX IF EXISTS evolution_conversations_logistica_status_assigned_to_idx;

DROP INDEX IF EXISTS evolution_conversations_wpp2_status_assigned_to_idx;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: WEBHOOK EVENT PARTITION — unused status and remote_jid indexes
-- These partitions are written to by RabbitMQ consumer, never queried directly
-- ═══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_03_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_03_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_04_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_04_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_05_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_05_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_06_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_06_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_09_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_09_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_10_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_10_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_11_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_11_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_12_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2026_12_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_default_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_default_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_default_event_type_processed_idx;

-- Future partition pre-created indexes (also never used, drop now to avoid accumulation)
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_01_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_01_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_02_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_02_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_03_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_03_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_04_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_05_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_05_remote_jid_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_06_status_created_at_idx;
DROP INDEX IF EXISTS evolution_webhook_events_v2_2027_06_remote_jid_created_at_idx;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: CRM / AUX TABLES — all unused (tables have 0 or near-0 rows)
-- ═══════════════════════════════════════════════════════════════════════════════

-- evolution_deals (0 rows)
DROP INDEX IF EXISTS idx_deal_value;
DROP INDEX IF EXISTS idx_deals_active_pipeline;
DROP INDEX IF EXISTS idx_deals_assigned;
DROP INDEX IF EXISTS idx_deals_expected_close;
DROP INDEX IF EXISTS idx_deals_stage;

-- evolution_reactions (minimal rows)
DROP INDEX IF EXISTS idx_reactions_message;
DROP INDEX IF EXISTS idx_reactions_jid;
DROP INDEX IF EXISTS idx_reactions_emoji;
DROP INDEX IF EXISTS idx_reactions_created;

-- evolution_calls (minimal rows)
DROP INDEX IF EXISTS idx_calls_created;
DROP INDEX IF EXISTS idx_calls_missed;
DROP INDEX IF EXISTS idx_calls_remote_jid;
DROP INDEX IF EXISTS idx_fk_evolution_calls_contact_id;

-- evolution_followups (minimal rows)
DROP INDEX IF EXISTS idx_followups_deal_type_status;
DROP INDEX IF EXISTS idx_followups_scheduled_pending;

-- evolution_bitrix_queue (0 rows — Bitrix integration not active)
DROP INDEX IF EXISTS idx_bitrix_queue_local_id_status;
DROP INDEX IF EXISTS idx_bitrix_queue_worker;
DROP INDEX IF EXISTS idx_bitrix_queue_entity;

-- evolution_status_auto_rules (0 rows)
DROP INDEX IF EXISTS idx_srules_active;

-- evolution_status_reactions (0 rows)
DROP INDEX IF EXISTS idx_sreact_status;
DROP INDEX IF EXISTS idx_sreact_unsent;
DROP INDEX IF EXISTS idx_sreact_rule;

-- evolution_incident_runbook (0 rows — runbook is in OPERATIONS.md, not DB)
DROP INDEX IF EXISTS idx_evo_incident_runbook_severity;
DROP INDEX IF EXISTS idx_evo_incident_runbook_category;

-- evolution_media
DROP INDEX IF EXISTS idx_evo_media_stickers;
DROP INDEX IF EXISTS idx_evo_media_animated;

-- evolution_health_logs
DROP INDEX IF EXISTS idx_evo_health_failures;

-- evolution_instance_credentials
DROP INDEX IF EXISTS idx_evo_creds_health;

-- evolution_ip_watch
DROP INDEX IF EXISTS idx_evo_ip_watch_ip_ts;
