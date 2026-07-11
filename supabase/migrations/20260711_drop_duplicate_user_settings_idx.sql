-- Drop duplicate UNIQUE index on user_settings.user_id
-- idx_user_settings_user (CREATE UNIQUE INDEX) duplicated user_settings_user_id_key
-- Both were UNIQUE btree(user_id), 0 scans. Only one needed.
-- user_settings_user_id_key remains as the canonical unique index.
-- Safe: not backed by pg_constraint, standalone index only.

DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_settings_user;

-- Verification (should return 2 rows: pkey + user_id_key):
-- SELECT indexrelname FROM pg_stat_user_indexes WHERE relname='user_settings';
