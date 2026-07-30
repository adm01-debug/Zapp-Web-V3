-- Migration: 20260704_add_evo_messages_unread_index_all_partitions.sql
-- Adds partial index idx_*_msgs_unread_contact on all 24 partitions of
-- evo.evolution_messages that did not yet have the index.
--
-- Index design: (contact_id) WHERE from_me=false AND is_read=false
-- Optimizes: rpc_mark_messages_as_read + unread count queries (used heavily
-- in the inbox — one query per contact selection).
--
-- 3 partitions already had this index from a previous session:
--   evolution_messages_wpp2, evolution_messages_wpp_pink_test,
--   evolution_messages_comercial_03
-- This migration adds it to the remaining 21 empty partitions so that
-- when traffic data arrives for those WhatsApp instances, queries are
-- immediately optimal without any further DDL.
--
-- Note: CONCURRENTLY is not supported on partitioned tables in PG15.
-- These partitions are empty (0 rows) so the lock is instantaneous.

CREATE INDEX IF NOT EXISTS idx_artes_msgs_unread_contact        ON evo.evolution_messages_artes        (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial01_msgs_unread_contact  ON evo.evolution_messages_comercial_01  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial02_msgs_unread_contact  ON evo.evolution_messages_comercial_02  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial04_msgs_unread_contact  ON evo.evolution_messages_comercial_04  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial05_msgs_unread_contact  ON evo.evolution_messages_comercial_05  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial06_msgs_unread_contact  ON evo.evolution_messages_comercial_06  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial07_msgs_unread_contact  ON evo.evolution_messages_comercial_07  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial08_msgs_unread_contact  ON evo.evolution_messages_comercial_08  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial09_msgs_unread_contact  ON evo.evolution_messages_comercial_09  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial10_msgs_unread_contact  ON evo.evolution_messages_comercial_10  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial11_msgs_unread_contact  ON evo.evolution_messages_comercial_11  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial12_msgs_unread_contact  ON evo.evolution_messages_comercial_12  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial13_msgs_unread_contact  ON evo.evolution_messages_comercial_13  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial14_msgs_unread_contact  ON evo.evolution_messages_comercial_14  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_comercial15_msgs_unread_contact  ON evo.evolution_messages_comercial_15  (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_compras_msgs_unread_contact      ON evo.evolution_messages_compras       (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_default_msgs_unread_contact      ON evo.evolution_messages_default       (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_financeiro_msgs_unread_contact   ON evo.evolution_messages_financeiro    (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_gravacao_msgs_unread_contact     ON evo.evolution_messages_gravacao      (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_logistica_msgs_unread_contact    ON evo.evolution_messages_logistica     (contact_id) WHERE from_me=false AND is_read=false;
CREATE INDEX IF NOT EXISTS idx_marketing_msgs_unread_contact    ON evo.evolution_messages_marketing     (contact_id) WHERE from_me=false AND is_read=false;
