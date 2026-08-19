-- ============================================================================
-- Migration: rb2_d9_kpi_overview — sync runbook-2 Onda 3 (06/08/2026)
-- View de KPIs/SLAs (D-9). security_invoker=true. Idempotente (CREATE OR REPLACE).
-- ============================================================================
CREATE OR REPLACE VIEW evo.v_kpi_overview AS
WITH probe AS (
    SELECT evolution_pipeline_health_log.checked_at,
        evolution_pipeline_health_log.pipeline_status,
        evolution_pipeline_health_log.gap_inbound_min
    FROM evo.evolution_pipeline_health_log
    WHERE evolution_pipeline_health_log.notes ~~ 'probe-15min%'::text
    ORDER BY evolution_pipeline_health_log.checked_at DESC
    LIMIT 1
), reconcile AS (
    SELECT evolution_pipeline_health_log.checked_at,
        evolution_pipeline_health_log.notes
    FROM evo.evolution_pipeline_health_log
    WHERE evolution_pipeline_health_log.notes ~~ 'reconcile-source-mirror%'::text
    ORDER BY evolution_pipeline_health_log.checked_at DESC
    LIMIT 1
), msgs AS (
    SELECT count(*) FILTER (WHERE evolution_messages.created_at >= (now() - '01:00:00'::interval)) AS msgs_1h,
        count(*) FILTER (WHERE evolution_messages.created_at >= (now() - '24:00:00'::interval)) AS msgs_24h,
        max(evolution_messages.created_at) AS last_ingest
    FROM evo.evolution_messages
), audit AS (
    SELECT round(avg(webhook_audit_log.duration_ms) FILTER (WHERE webhook_audit_log.duration_ms IS NOT NULL), 1) AS avg_ms,
        round(percentile_cont(0.95::double precision) WITHIN GROUP (ORDER BY (webhook_audit_log.duration_ms::double precision))::numeric, 1) AS p95_ms,
        count(*) AS n_24h
    FROM zapp.webhook_audit_log
    WHERE webhook_audit_log.created_at >= (now() - '24:00:00'::interval)
), dlq AS (
    SELECT (SELECT count(*) AS count FROM evo.evolution_webhook_dlq WHERE evolution_webhook_dlq.status = 'pending'::text) AS dlq_evo_pending,
        (SELECT count(*) AS count FROM _consumer_dlq WHERE _consumer_dlq.status = ANY (ARRAY['pending'::text, 'error'::text, 'failed'::text])) AS dlq_consumer_open
), dedup AS (
    SELECT count(*) AS failures_24h FROM v_dedup_failures
), ipw AS (
    SELECT count(*) AS hits_24h,
        count(*) FILTER (WHERE evolution_ip_watch.http_status = 401) AS hits_401
    FROM evo.evolution_ip_watch
    WHERE evolution_ip_watch.created_at >= (now() - '24:00:00'::interval)
)
SELECT now() AS checked_at,
    p.gap_inbound_min AS gap_sync_min,
    p.pipeline_status AS gap_sync_status,
    p.checked_at AS gap_sync_checked_at,
    CASE
        WHEN r.notes ~ 'msg=[0-9.]+%'::text THEN (regexp_match(r.notes, 'msg=([0-9.]+)%'::text))[1]::numeric
        ELSE NULL::numeric
    END AS mirror_msg_coverage_pct,
    r.checked_at AS mirror_coverage_checked_at,
    m.last_ingest AS last_ingest_at,
    m.msgs_1h,
    m.msgs_24h,
    round(m.msgs_24h::numeric / 24::numeric, 1) AS msgs_per_hour_avg_24h,
    d.failures_24h AS dedup_failures_24h,
    (SELECT count(*) AS count FROM zapp.webhook_event_dedup) AS dedup_tracked_rows,
    a.avg_ms AS webhook_latency_avg_ms_24h,
    a.p95_ms AS webhook_latency_p95_ms_24h,
    a.n_24h AS webhook_events_24h,
    CASE
        WHEN ipw.hits_24h > 0 THEN round(100.0 * ipw.hits_401::numeric / ipw.hits_24h::numeric, 2)
        ELSE NULL::numeric
    END AS pct_401_24h,
    ipw.hits_24h AS ipwatch_hits_24h,
    q.dlq_evo_pending,
    q.dlq_consumer_open,
    q.dlq_evo_pending + q.dlq_consumer_open AS dlq_total_open,
    NULL::numeric AS rabbitmq_backlog_messages,
    NULL::integer AS consumer_drop_total,
    'FONTES EXTERNAS: rabbitmq_backlog_messages -> rabbitmqctl list_queues (container rabbitmq) ou API :15672; consumer_drop_total -> logs evolution-rabbit-consumer [STATS] drop=N; pct_401_24h -> evolution_ip_watch sem dados (0 linhas, sem trigger): usar access log Traefik (grep DownstreamStatus=401).'::text AS notas
FROM probe p
    CROSS JOIN reconcile r
    CROSS JOIN msgs m
    CROSS JOIN audit a
    CROSS JOIN dlq q
    CROSS JOIN dedup d
    CROSS JOIN ipw ipw;
ALTER VIEW evo.v_kpi_overview SET (security_invoker = true);
COMMENT ON VIEW evo.v_kpi_overview IS 'KPIs/SLAs (D-9 runbook-2 06/08): gap sync, cobertura mirror, msgs/hora, latencia webhook->DB, dedup, %401, DLQ. Uso interno (evo fora do PGRST_DB_SCHEMAS).';
