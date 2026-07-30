-- Migration: Partial index on app_notifications for unread count performance
-- Deployed: 2026-07-30 | Via: Portainer CONCURRENTLY (no lock)
-- 
-- Context:
--   - zapp.app_notifications has 11,385 rows, currently 100% unread
--   - rpc_app_bootstrap counts unread notifications per user on every boot
--   - Old plan: Bitmap Heap Scan, 543 buffer hits, 1.079ms
--   - New plan: Index Only Scan, 61 buffer hits, 0.330ms (3.3x faster, 89% fewer reads)
--
-- Why partial index (WHERE is_read = false):
--   1. Smaller than full index (96kB vs 168kB for user_id-only index)
--   2. As users mark notifications read, index shrinks -> even better performance
--   3. Index Only Scan satisfies count(*) without touching heap pages
--   4. Future-proof: scales efficiently as system grows
--
-- Already deployed via Portainer CONCURRENTLY — this migration is idempotent

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_notifications_user_unread
  ON zapp.app_notifications(user_id)
  WHERE is_read = false;

-- Verify: should use Index Only Scan for notification count queries
-- EXPLAIN SELECT count(*) FROM zapp.app_notifications 
-- WHERE user_id = 'some-uuid'::uuid AND is_read = false;
