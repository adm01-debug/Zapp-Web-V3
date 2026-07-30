-- Backfill whatsapp_connections.instance_name from instance_id for legacy rows.
--
-- Context (incident S5-1, 2026-07-04): Before PR #183 (`instanceOrFilter` + resolver),
-- old code wrote the human-readable Evolution instance name into `instance_id` and left
-- `instance_name` NULL. The connection-health-check v2 skips any row where
-- routableInstanceName() returns null (i.e. both instance_name and instance_id are UUID
-- or blank) — but if instance_id holds a plain name like "wpp2", it should be promoted.
--
-- Rule: copy instance_id → instance_name only when:
--   a) instance_name IS NULL (not yet populated), AND
--   b) instance_id is NOT a UUID (confirmed human-readable name).
--
-- The CHECK constraint added in 20260705011839 ensures we cannot accidentally set
-- instance_name to a UUID value — so rows where instance_id IS a UUID are skipped and
-- must be handled by a supervised re-pairing (scan QR again, which sets instance_name).
--
-- Idempotent: re-running skips rows already with instance_name set.

UPDATE public.whatsapp_connections
   SET instance_name = TRIM(instance_id)
 WHERE instance_name IS NULL
   AND instance_id IS NOT NULL
   AND TRIM(instance_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND length(trim(instance_id)) > 0;

-- Verification query (run after migration):
--   SELECT id, name, phone_number, instance_id, instance_name
--     FROM public.whatsapp_connections
--    WHERE instance_name IS NULL;
--   (should return only rows where instance_id is UUID-format — those need QR re-scan)
