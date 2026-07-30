-- Migration: 20260727300007_move_wal_slot_guard_to_ops
-- Purpose: Move public._wal_slot_guard_events to ops._wal_slot_guard_events.
--          Create a security_invoker view in public for backwards compat.
--          This makes public schema have ZERO real tables (only views + RPC).
-- Risk: MEDIUM — cron wal-slot-monitor must reference ops.fn_check_wal_slots which
--       already writes to this table. After move, it will use the ops schema directly.
-- Staging required: YES (test cron wal-slot-monitor after migration).
-- Rollback: DROP VIEW public._wal_slot_guard_events;
--           ALTER TABLE ops._wal_slot_guard_events SET SCHEMA public;
-- Non-transactional ops: none (CONCURRENTLY not needed for this table size).
SET search_path = ops, public, pg_catalog;

-- 1. Create target table in ops (mirror schema of public._wal_slot_guard_events)
--    We use CREATE TABLE ... LIKE to preserve column definitions exactly.
--    NOTE: if the table already exists in ops, this is idempotent via IF NOT EXISTS.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'ops' AND tablename = '_wal_slot_guard_events'
    ) THEN
        -- Create the table in ops with same structure
        EXECUTE $sql$
            CREATE TABLE ops._wal_slot_guard_events (
                LIKE public._wal_slot_guard_events INCLUDING ALL
            )
        $sql$;

        COMMENT ON TABLE ops._wal_slot_guard_events IS
            'WAL slot guard events — telemetry of WAL slot lag exceeding thresholds. '
            'Moved from public to ops on 2026-07-27 (plan etapa 7). '
            'Originally in public as a Supabase internal table; belongs in ops (infra schema). '
            'Written by cron wal-slot-monitor (jobid 122) via ops.fn_check_wal_slots.';

        -- Copy existing data
        INSERT INTO ops._wal_slot_guard_events
        SELECT * FROM public._wal_slot_guard_events;

        RAISE NOTICE 'Table ops._wal_slot_guard_events created and data copied.';
    ELSE
        RAISE NOTICE 'Table ops._wal_slot_guard_events already exists, skipping creation.';
    END IF;
END;
$$;

-- 2. RLS on ops table (service_role-only — this is internal infra telemetry)
ALTER TABLE ops._wal_slot_guard_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops._wal_slot_guard_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON ops._wal_slot_guard_events TO service_role;

-- authenticated can SELECT for monitoring dashboard
GRANT SELECT ON ops._wal_slot_guard_events TO authenticated;

CREATE POLICY "authenticated can view wal slot events"
    ON ops._wal_slot_guard_events
    FOR SELECT
    TO authenticated
    USING (true);

-- 3. Replace public table with a security_invoker view pointing to ops
--    (backwards compat for any code still referencing public._wal_slot_guard_events)
DO $$
BEGIN
    -- Drop the real table from public only after data is safely in ops
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = '_wal_slot_guard_events'
    ) THEN
        DROP TABLE public._wal_slot_guard_events;
        RAISE NOTICE 'public._wal_slot_guard_events dropped.';
    END IF;
END;
$$;

-- 4. Create backwards-compat view in public
CREATE OR REPLACE VIEW public._wal_slot_guard_events
WITH (security_invoker = on) AS
SELECT * FROM ops._wal_slot_guard_events;

COMMENT ON VIEW public._wal_slot_guard_events IS
    'Backwards-compat view — real table is ops._wal_slot_guard_events. '
    'Moved 2026-07-27 (plan etapa 7). '
    'This view exists so any legacy code/cron using public._wal_slot_guard_events still works.';

-- 5. Verify: public schema now has 0 real tables
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '\_%';  -- internal supabase tables start with _

    -- After this migration, public should have at most the view (not a table)
    SELECT COUNT(*) INTO v_count
    FROM pg_tables
    WHERE schemaname = 'public';

    IF v_count > 0 THEN
        RAISE WARNING 'public still has % table(s) after migration. Investigate.', v_count;
    ELSE
        RAISE NOTICE '✓ public schema now has 0 real tables.';
    END IF;
END;
$$;
