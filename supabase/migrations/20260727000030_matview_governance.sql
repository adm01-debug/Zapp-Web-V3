-- ============================================================
-- Migration: 20260727000030_matview_governance
-- Objetivo: Governança de matviews — refresh schedules e staleness alerts
-- Criado: 2026-07-27
--参阅: Step 30
-- ============================================================

-- ============================================================================
-- Tabela de governança de matviews
-- ============================================================================
CREATE TABLE IF NOT EXISTS ops.matview_governance (
    matview_schema    TEXT NOT NULL,
    matview_name      TEXT NOT NULL,
    refresh_mode      TEXT NOT NULL CHECK (refresh_mode IN ('manual','scheduled','triggered')),
    refresh_interval  INTERVAL,          -- ex: '30 minutes', '1 hour'
    last_refreshed_at TIMESTAMPTZ,
    last_refresh_ms   INTEGER,            -- duração do último refresh
    staleness_minutes INTEGER DEFAULT 60, -- alerta se mais antigo que isso
    is_stale          BOOLEAN GENERATED ALWAYS AS (
        last_refreshed_at IS NULL
        OR age(now(), last_refreshed_at) > (staleness_minutes || ' minutes')::interval
    ) STORED,
    refresh_error     TEXT,
    PRIMARY KEY (matview_schema, matview_name)
);

-- Seed das 6 matviews do zapp
INSERT INTO ops.matview_governance (matview_schema, matview_name, refresh_mode, refresh_interval, staleness_minutes, notes)
VALUES
    ('zapp', 'vw_dashboard_metrics',    'scheduled', '15 minutes',  20, 'Dashboard KPI — atualizar frequently'),
    ('zapp', 'vw_contato_stats',       'scheduled', '30 minutes',  60, 'Stats de contato'),
    ('zapp', 'vw_ticket_sla',           'scheduled', '15 minutes',  30, 'SLA tickets'),
    ('zapp', 'vw_empresa_faturamento',  'scheduled', '1 hour',      120,'Faturamento por empresa'),
    ('zapp', 'vw_user_activity',        'scheduled', '30 minutes',  60, 'User activity log'),
    ('zapp', 'vw_inbox_summary',        'scheduled', '5 minutes',   10, 'Inbox real-time summary')
ON CONFLICT (matview_schema, matview_name) DO NOTHING;

-- ============================================================================
-- Função de refresh com tracking
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_refresh_matview_safe(
    p_matview_schema TEXT,
    p_matview_name   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    start_ts   TIMESTAMPTZ := clock_timestamp();
    refresh_ms INTEGER;
    success    BOOLEAN := false;
    sql_text  TEXT;
BEGIN
    sql_text := format('REFRESH MATERIALIZED VIEW %I.%I', p_matview_schema, p_matview_name);

    BEGIN
        EXECUTE sql_text;
        refresh_ms := floor((clock_timestamp() - start_ts)::NUMERIC * 1000)::INTEGER;

        UPDATE ops.matview_governance
        SET last_refreshed_at = clock_timestamp(),
            last_refresh_ms   = refresh_ms,
            refresh_error     = NULL
        WHERE matview_schema = p_matview_schema
          AND matview_name   = p_matview_name;

        success := true;
    EXCEPTION WHEN OTHERS THEN
        UPDATE ops.matview_governance
        SET refresh_error = sqlerrm
        WHERE matview_schema = p_matview_schema
          AND matview_name   = p_matview_name;
        RAISE;
    END;

    RETURN success;
END;
$$;

-- ============================================================================
-- Visão de matviews stale (alertas)
-- ============================================================================
CREATE OR REPLACE VIEW ops.v_matview_stale AS
SELECT
    matview_schema,
    matview_name,
    refresh_mode,
    last_refreshed_at,
    staleness_minutes,
    age(now(), last_refreshed_at) AS staleness_age,
    refresh_error
FROM ops.matview_governance
WHERE is_stale = true
ORDER BY age(now(), last_refreshed_at) DESC;

-- ============================================================================
-- Função de refresh de todas as matviews (para cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_refresh_all_matviews_scheduled()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT matview_schema, matview_name
        FROM ops.matview_governance
        WHERE refresh_mode = 'scheduled'
          AND (last_refreshed_at IS NULL
               OR age(now(), last_refreshed_at) >= refresh_interval)
    LOOP
        PERFORM ops.fn_refresh_matview_safe(r.matview_schema, r.matview_name);
    END LOOP;
END;
$$;

-- Registrar cron (executar a cada 5 minutos)
SELECT cron.schedule(
    'matview-refresh-scheduled',
    '*/5 * * * *',
    'SELECT ops.fn_refresh_all_matviews_scheduled()'
);
