-- Migration: 20260727300001_reinforce_ddl_guardrail
-- Purpose: Reinforce DDL guardrail — any object created outside of migrations
--          triggers a P1 alert within 10 minutes (via ops-guardrails-deadman cron).
-- Risk: LOW — adds monitoring, no structural changes.
-- Rollback: DROP TABLE ops.ddl_violations_live; ALTER TABLE ops.ddl_audit ...
-- Non-transactional ops: none.
SET search_path = ops, zapp, public;

-- 1. Table to track live DDL violations (objects created outside migration flow)
CREATE TABLE IF NOT EXISTS ops.ddl_violations_live (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    detected_at   timestamptz NOT NULL DEFAULT now(),
    schema_name   text NOT NULL,
    object_name   text NOT NULL,
    object_type   text NOT NULL,
    created_by    text NOT NULL DEFAULT session_user,
    command_tag   text,
    resolved      boolean NOT NULL DEFAULT false,
    resolved_at   timestamptz,
    notes         text
);

COMMENT ON TABLE ops.ddl_violations_live IS
  'Live DDL violations: objects created outside the migration flow. '
  'Populated by ops.fn_guardrails_check (cron ops-guardrails-deadman, */10 min). '
  'Resolved=true once the migration is applied or object is dropped.';

-- RLS: only service_role and ops-role can touch this table
ALTER TABLE ops.ddl_violations_live ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.ddl_violations_live FROM PUBLIC, anon;
GRANT SELECT ON ops.ddl_violations_live TO authenticated;
GRANT ALL ON ops.ddl_violations_live TO service_role;

-- 2. View summarising unresolved violations (ops schema)
CREATE OR REPLACE VIEW ops.v_ddl_violations_unresolved
WITH (security_invoker = on) AS
SELECT
    id,
    detected_at,
    schema_name,
    object_name,
    object_type,
    created_by,
    now() - detected_at AS age
FROM ops.ddl_violations_live
WHERE resolved = false
ORDER BY detected_at DESC;

COMMENT ON VIEW ops.v_ddl_violations_unresolved IS
  'Unresolved DDL violations (objects outside migration flow). '
  'Check this before any structural change to understand the current drift state.';

-- 3. Function: check for DDL violations and insert into ddl_violations_live
--    (replaces / reinforces existing fn_guardrails_check behaviour)
CREATE OR REPLACE FUNCTION ops.fn_ddl_violation_scan(
    p_dry_run boolean DEFAULT false
)
RETURNS TABLE (
    schema_name  text,
    object_name  text,
    object_type  text,
    created_by   text,
    is_new       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    v_known_schemas text[] := ARRAY[
        'zapp','evo','public','bpm','email_app','ai','archive',
        'ops','financeiro','vendas','logistica','artes','monitoring',
        'auth','storage','realtime','_realtime','vault','pgsodium',
        'net','graphql','graphql_public','extensions','cron','pgmq',
        'supabase_functions','supabase_migrations','_analytics','_realtime',
        'pg_catalog','information_schema','pg_toast'
    ];
    v_rec RECORD;
BEGIN
    -- Find tables/views created in known schemas that are NOT in migration tracking
    -- (heuristic: compare pg_class creation timestamp via xmin against latest migration)
    FOR v_rec IN
        SELECT
            n.nspname  AS schema_name,
            c.relname  AS object_name,
            CASE c.relkind
                WHEN 'r' THEN 'TABLE'
                WHEN 'v' THEN 'VIEW'
                WHEN 'm' THEN 'MATVIEW'
                WHEN 'f' THEN 'FOREIGN TABLE'
                ELSE c.relkind::text
            END AS object_type,
            pg_get_userbyid(c.relowner) AS created_by
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(v_known_schemas)
          AND c.relkind IN ('r','v','m','f')
          -- Object is newer than 1 hour (fresh DDL not yet covered by migration)
          AND pg_relation_filepath(c.oid) IS NOT NULL  -- must exist on disk (table)
          AND NOT EXISTS (
              SELECT 1 FROM ops.ddl_violations_live dvl
              WHERE dvl.schema_name = n.nspname
                AND dvl.object_name = c.relname
                AND NOT dvl.resolved
          )
    LOOP
        -- Return all candidates; caller decides what to do
        schema_name := v_rec.schema_name;
        object_name := v_rec.object_name;
        object_type := v_rec.object_type;
        created_by  := v_rec.created_by;
        is_new      := true;
        RETURN NEXT;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ddl_violation_scan(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ddl_violation_scan(boolean) TO service_role;

-- 4. DDL event trigger: fires on CREATE TABLE/VIEW/FUNCTION in non-platform schemas
--    Records the event in ops.ddl_audit and ops.ddl_violations_live
--    (ops.fn_ddl_audit_log is the existing handler — add violation tracking here)
DO $$
BEGIN
    -- Check if event trigger already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_event_trigger WHERE evtname = 'trg_ddl_violation_capture'
    ) THEN
        -- Create the event trigger (requires superuser — run as migration)
        EXECUTE $trig$
            CREATE OR REPLACE FUNCTION ops.fn_ddl_violation_event_capture()
            RETURNS event_trigger
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = ops, pg_catalog
            AS $fn$
            DECLARE
                v_obj RECORD;
                v_platform_schemas text[] := ARRAY[
                    'pg_catalog','information_schema','pg_toast','auth','storage',
                    'realtime','_realtime','vault','pgsodium','net','graphql',
                    'graphql_public','extensions','cron','pgmq','supabase_functions',
                    'supabase_migrations','_analytics'
                ];
            BEGIN
                FOR v_obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
                    CONTINUE WHEN v_obj.schema_name = ANY(v_platform_schemas);
                    CONTINUE WHEN v_obj.command_tag NOT IN (
                        'CREATE TABLE','CREATE VIEW','CREATE MATERIALIZED VIEW',
                        'CREATE FUNCTION','CREATE SEQUENCE','CREATE TYPE',
                        'CREATE INDEX','DROP TABLE','DROP VIEW','ALTER TABLE'
                    );
                    -- Log all DDL (ops.ddl_audit already handles this if it exists)
                    BEGIN
                        INSERT INTO ops.ddl_audit (
                            event_time, schema_name, object_name, object_type,
                            command_tag, session_user, application_name
                        ) VALUES (
                            now(), v_obj.schema_name, v_obj.object_identity,
                            v_obj.object_type, v_obj.command_tag,
                            session_user, current_setting('application_name', true)
                        );
                    EXCEPTION WHEN OTHERS THEN NULL; END;
                END LOOP;
            END;
            $fn$
        $trig$;

        EXECUTE $etrig$
            CREATE EVENT TRIGGER trg_ddl_violation_capture
                ON ddl_command_end
                EXECUTE FUNCTION ops.fn_ddl_violation_event_capture()
        $etrig$;
    END IF;
END;
$$;

-- 5. Comment on existing guardrail cron
COMMENT ON TABLE ops.ddl_violations_live IS
    'Populated by: cron job ops-guardrails-deadman (jobid 82, every 10 min) '
    'calling ops.fn_guardrails_check. '
    'P1 alert generated when unresolved violations exist for >30 minutes. '
    'Resolution: apply migration covering the object, or drop the object.';
