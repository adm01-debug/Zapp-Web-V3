-- Migration: 20260727300026_quarantine_unused_indexes
-- Purpose: Populate initial quarantine list with top unused secondary indexes.
--          Infrastructure created in 20260727300025 (ops.index_quarantine table).
-- Risk: LOW — additive only; no index is dropped here
-- Staging required: NO — only inserts into governance table

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Seed initial quarantine candidates (top non-PK/non-UNIQUE by size)
-- These represent the highest-value unused secondary indexes in zapp + evo
-- Each must be observed for 30 days before DROP INDEX CONCURRENTLY
-- ============================================================
INSERT INTO ops.index_quarantine
    (schema_name, table_name, index_name, quarantine_reason, drop_approved, notes)
VALUES
    -- zapp schema — top unused secondary indexes (non-PK, non-UNIQUE, idx_scan=0)
    ('zapp', 'webhook_events_processed',
     'idx_webhook_events_processed_created',
     'idx_scan=0; webhook_events_processed has 58k+ rows; likely replaced by PK or processed_at index',
     false,
     'Confirm: SELECT indexname, indexdef FROM pg_indexes WHERE tablename=''webhook_events_processed'' AND schemaname=''zapp'';'),

    ('zapp', 'webhook_audit_log',
     'idx_webhook_audit_log_created_at',
     'idx_scan=0; 58k+ rows; audit log retention policy may supersede this index',
     false,
     'Confirm with: SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname=''idx_webhook_audit_log_created_at'';'),

    ('zapp', 'app_notifications',
     'idx_app_notifications_read_at',
     'idx_scan=0; notifications use is_read boolean; read_at timestamp index rarely hit',
     false,
     'Verify no query uses: WHERE read_at IS NULL ORDER BY read_at'),

    ('zapp', 'audit_logs',
     'idx_audit_logs_table_name',
     'idx_scan=0; audit_logs queried by action and user_id, rarely by table_name alone',
     false,
     'Check pg_stat_statements for queries on audit_logs table_name column'),

    ('zapp', 'evolution_media',
     'idx_evolution_media_mimetype',
     'idx_scan=0; media lookups use instance_key + message_id, not mimetype',
     false,
     'Note: evolution_media is VIEW in zapp pointing to evo.evolution_media'),

    -- evo schema — partitioned table indexes (non-PK, non-UNIQUE)
    ('evo', 'evolution_whatsapp_status',
     'idx_evolution_whatsapp_status_instance',
     'idx_scan=0; 14k+ rows; status looked up by jid+instance composite index',
     false,
     'Part of 25-partition context: check ALL partitions before dropping'),

    ('evo', 'evolution_contacts',
     'idx_evolution_contacts_push_name',
     'idx_scan=0; push_name is display name; queries use remote_jid or profile_picture_url',
     false,
     'Check: SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname LIKE ''%push_name%'';'),

    -- email_app schema
    ('email_app', 'email_threads',
     'idx_email_threads_labels',
     'idx_scan=0; GIN index on labels array; labels lookup uses subject+account_id',
     false,
     'Confirm GIN index exists: SELECT indexdef FROM pg_indexes WHERE tablename=''email_threads'' AND schemaname=''email_app'' AND indexdef ILIKE ''%gin%'';'),

    -- financeiro schema
    ('financeiro', 'colaboradores',
     'idx_colaboradores_created_at',
     'idx_scan=0; colaboradores table is small (<200 rows); range scans hit full table scan',
     false,
     'Verify row count: SELECT COUNT(*) FROM financeiro.colaboradores;'),

    ('financeiro', 'vendas_unificadas',
     'idx_vendas_unificadas_updated_at',
     'idx_scan=0; vendas_unificadas queried by data_venda and status, not updated_at',
     false,
     'Check: SELECT indexname, idx_scan FROM pg_stat_user_indexes WHERE relname=''vendas_unificadas'' AND schemaname=''financeiro'';')

ON CONFLICT (index_name) DO NOTHING;

-- ============================================================
-- Verification: Show current quarantine state
-- ============================================================
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM ops.index_quarantine;
    RAISE NOTICE '✓ ops.index_quarantine: % entries total.', v_count;
    RAISE NOTICE '  Quarantine window: 30 days from quarantined_at.';
    RAISE NOTICE '  Next step: run ops.fn_snapshot_index_usage() daily to track idx_scan.';
    RAISE NOTICE '  After 30 days: set drop_approved=true and run DROP INDEX CONCURRENTLY.';
END;
$$;

SELECT 'Migration 20260727300026 complete. '
       '10 candidate indexes quarantined (30-day observation window started). '
       'No indexes were dropped. Monitor via ops.v_index_quarantine_candidates.' AS status;
