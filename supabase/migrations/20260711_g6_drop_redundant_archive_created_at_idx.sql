-- G6: Drop redundant created_at_idx (ascending, 0 scans) from evolution_messages_wpp2_archive
-- Replaced by created_at_idx2 (DESC, 7 scans) which handles both ASC and DESC via backward scan
-- Evidence: 0 scans in 96h / 384k+ events vs 7 scans for _idx2
-- Executed: 2026-07-11 via DROP INDEX CONCURRENTLY (no table lock)

-- Idempotent: safe to re-run
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_messages_wpp2_archive_created_at_idx;

-- Verification: should return 0 rows
-- SELECT indexrelname FROM pg_stat_user_indexes
-- WHERE relname='evolution_messages_wpp2_archive'
-- AND indexrelname = 'evolution_messages_wpp2_archive_created_at_idx';
