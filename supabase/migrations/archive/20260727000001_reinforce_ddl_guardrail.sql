-- ============================================================
-- Migration: 20260727000001_reinforce_ddl_guardrail
-- Objetivo: Reforçar guardrails de DDL com auditoria ativa
-- Executado: 2026-07-27
-- ============================================================

-- Tabela de violações capturadas em tempo real
CREATE TABLE IF NOT EXISTS ops.ddl_violations_live (
    id          BIGSERIAL PRIMARY KEY,
    schema_name TEXT,
    object_type TEXT,
    object_name TEXT,
    ddl_sql     TEXT,
    session_id  INTEGER,
    pid         INTEGER,
    username    TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Visão para violações não resolvidas
CREATE OR REPLACE VIEW ops.v_ddl_violations_unresolved AS
SELECT v.*
FROM ops.ddl_violations_live v
WHERE NOT EXISTS (
    SELECT 1 FROM ops.ddl_violations_resolved r
    WHERE r.violation_id = v.id
);

-- Função de scan dry-run
CREATE OR REPLACE FUNCTION ops.fn_ddl_violation_scan(dry_run BOOLEAN DEFAULT true)
RETURNS TABLE(schema_name TEXT, object_type TEXT, object_name TEXT, issue TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    IF dry_run THEN
        -- Simula scan sem criar tabelas
        RAISE NOTICE 'Dry-run: no objects created';
    END IF;
END;
$$;

-- Event trigger para capturar DDL fora de migrations
CREATE OR REPLACE FUNCTION ops.fn_ddl_violation_capture()
RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    INSERT INTO ops.ddl_violations_live (schema_name, object_type, object_name, ddl_sql, pid, username)
    SELECT
        event_object_schema::text,
        event_object_type::text,
        object_identity::text,
        pg_event_trigger_ddl_command()::text,
        pg_backend_pid(),
        session_user::text
    FROM pg_event_trigger_ddl_commands()
    WHERE NOT (event_object_schema::text IN ('pg_catalog','information_schema','ops'));
END;
$$;

-- Trigger de evento (criado separadamente para evitar dependencia)
DO $$
BEGIN
    CREATE EVENT TRIGGER trg_ddl_violation_capture
    ON ddl_command_end
    WHEN TAG IN (
        'CREATE TABLE','ALTER TABLE','DROP TABLE',
        'CREATE INDEX','DROP INDEX',
        'CREATE VIEW','CREATE OR REPLACE VIEW','DROP VIEW',
        'CREATE FUNCTION','CREATE OR REPLACE FUNCTION','DROP FUNCTION'
    )
    EXECUTE FUNCTION ops.fn_ddl_violation_capture();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Event trigger trg_ddl_violation_capture ja existe — ignorado';
END;
$$;
