-- ============================================================================
-- Migration: rb2_onda3_views_drops — sync runbook-2 Onda 3 (06/08/2026)
-- Aplica/registra no repo as DDLs executadas diretamente no banco pelos
-- agentes da Onda 3 (execução 06/08): drops do inventário C-8 (8 tabelas
-- fantasma + mirrors) e views de observabilidade D-3 (v_health_unified)
-- e D-9 (v_kpi_overview). Idempotente (drops IF EXISTS + CREATE OR REPLACE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C-8: tabelas fantasma dropadas (0 linhas, 0 FKs, 0 refs custom — verificado
-- antes de cada drop em 06/08). Mirrors zapp.*/public.* dropados junto.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS evo.evolution_baileys_session_history;
DROP TABLE IF EXISTS evo.evolution_contact_attachments;
DROP TABLE IF EXISTS evo.evolution_contact_blacklist;
DROP TABLE IF EXISTS evo.evolution_group_stats;
DROP TABLE IF EXISTS evo.evolution_sentiment_alerts;
DROP TABLE IF EXISTS evo.evolution_sentiment_metrics;
DROP TABLE IF EXISTS evo.evolution_status_auto_rules;
DROP TABLE IF EXISTS evo.evolution_typebot_sessions;

-- Mirrors auto-gerados (backcompat) das tabelas dropadas:
DROP VIEW IF EXISTS zapp.evolution_baileys_session_history;
DROP VIEW IF EXISTS public.evolution_baileys_session_history;
DROP VIEW IF EXISTS zapp.evolution_contact_attachments;
DROP VIEW IF EXISTS public.evolution_contact_attachments;
DROP VIEW IF EXISTS zapp.evolution_contact_blacklist;
DROP VIEW IF EXISTS public.evolution_contact_blacklist;
DROP VIEW IF EXISTS zapp.evolution_group_stats;
DROP VIEW IF EXISTS public.evolution_group_stats;
DROP VIEW IF EXISTS zapp.evolution_sentiment_alerts;
DROP VIEW IF EXISTS public.evolution_sentiment_alerts;
DROP VIEW IF EXISTS zapp.evolution_sentiment_metrics;
DROP VIEW IF EXISTS public.evolution_sentiment_metrics;
DROP VIEW IF EXISTS zapp.evolution_status_auto_rules;
DROP VIEW IF EXISTS public.evolution_status_auto_rules;
DROP VIEW IF EXISTS zapp.evolution_typebot_sessions;
DROP VIEW IF EXISTS public.evolution_typebot_sessions;

-- ---------------------------------------------------------------------------
-- D-3: evo.v_health_unified — painel único de saúde (pipeline, mirror v2,
-- health log, crons 24h, consumer, 401, scorecard). security_invoker=true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW evo.v_health_unified AS
WITH pipe AS (
    SELECT v_pipeline_health.msgs_5min,
        v_pipeline_health.msgs_1h,
        v_pipeline_health.lag_seconds,
        v_pipeline_health.last_ingest,
        v_pipeline_health.pipeline_status,
        v_pipeline_health.strict_status,
        v_pipeline_health.traffic_level,
        v_pipeline_health.business_hours_status
    FROM v_pipeline_health
), mirror AS (
    SELECT x.j ->> 'v2_status'::text AS v2_status,
        (x.j ->> 'v2_score'::text)::integer AS v2_score,
        (x.j ->> 'v2_hours_dead'::text)::numeric AS v2_hours_dead,
        (x.j ->> 'v2_last_event'::text)::timestamp with time zone AS v2_last_event,
        (x.j ->> 'v2_total_rows'::text)::bigint AS v2_total_rows,
        (x.j ->> 'v2_last_7d'::text)::bigint AS v2_last_7d,
        (x.j ->> 'v2_last_24h'::text)::bigint AS v2_last_24h,
        (x.j ->> 'v2_pending'::text)::bigint AS v2_pending,
        (x.j ->> 'v2_processed_1h'::text)::bigint AS v2_processed_1h,
        (x.j ->> 'audit_log_last'::text)::timestamp with time zone AS audit_log_last,
        (x.j ->> 'audit_log_1h'::text)::bigint AS audit_log_1h,
        (x.j ->> 'audit_healthy'::text)::boolean AS audit_healthy,
        (x.j ->> 'divergence'::text)::boolean AS mirror_divergence,
        (x.j ->> 'infra_fix_needed'::text)::boolean AS infra_fix_needed
    FROM (SELECT fn_v2_mirror_health() AS j) x
), hl AS (
    SELECT evolution_pipeline_health_log.checked_at AS health_log_at,
        evolution_pipeline_health_log.pipeline_status::text AS health_log_status,
        evolution_pipeline_health_log.gap_inbound_min,
        evolution_pipeline_health_log.webhook_events_1h,
        evolution_pipeline_health_log.probe_status,
        evolution_pipeline_health_log.probe_latency_ms,
        evolution_pipeline_health_log.notes
    FROM evo.evolution_pipeline_health_log
    ORDER BY evolution_pipeline_health_log.checked_at DESC
    LIMIT 1
), cs AS (
    SELECT evolution_pipeline_health_log.checked_at AS consumer_stats_at,
        evolution_pipeline_health_log.consumer_ok_count,
        evolution_pipeline_health_log.consumer_filas
    FROM evo.evolution_pipeline_health_log
    WHERE evolution_pipeline_health_log.consumer_ok_count IS NOT NULL
    ORDER BY evolution_pipeline_health_log.checked_at DESC
    LIMIT 1
), cr AS (
    SELECT count(*) AS cron_runs_24h,
        count(*) FILTER (WHERE job_run_details.status = 'succeeded'::text) AS cron_succeeded_24h,
        count(*) FILTER (WHERE job_run_details.status = 'failed'::text) AS cron_failed_24h,
        count(DISTINCT job_run_details.jobid) AS cron_jobs_24h,
        max(job_run_details.start_time) AS cron_last_run_at,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('jobid', job_run_details.jobid, 'command', left(job_run_details.command, 80))) FILTER (WHERE job_run_details.status = 'failed'::text), '[]'::jsonb) AS cron_failed_jobs
    FROM cron.job_run_details
    WHERE job_run_details.start_time > (now() - '24:00:00'::interval)
), ch AS (
    SELECT job_run_details.status AS consumer_halt_last_status
    FROM cron.job_run_details
    WHERE job_run_details.jobid = 144
    ORDER BY job_run_details.runid DESC
    LIMIT 1
), o401 AS (
    SELECT COALESCE(sum(v_401_observability.hit_count), 0::numeric)::bigint AS http_401_hits_24h,
        count(DISTINCT v_401_observability.ip_address) AS http_401_unique_ips,
        max(v_401_observability.last_seen) AS http_401_last_seen
    FROM v_401_observability
), sc AS (
    SELECT v_production_scorecard.total_messages,
        v_production_scorecard.total_contacts,
        v_production_scorecard.total_conversations,
        v_production_scorecard.open_alerts,
        v_production_scorecard.bootstrap_needed_24h,
        v_production_scorecard.generated_at AS scorecard_at
    FROM v_production_scorecard
)
SELECT now() AS checked_at,
    pipe.pipeline_status,
    pipe.strict_status,
    pipe.traffic_level,
    pipe.msgs_5min,
    pipe.msgs_1h,
    pipe.lag_seconds AS pipeline_lag_s,
    pipe.last_ingest AS last_ingest_at,
    pipe.business_hours_status,
    mirror.v2_status,
    mirror.v2_score,
    mirror.v2_hours_dead,
    mirror.v2_last_event AS v2_last_event_at,
    mirror.v2_total_rows,
    mirror.v2_last_7d,
    mirror.v2_last_24h,
    mirror.v2_pending,
    mirror.v2_processed_1h,
    mirror.audit_healthy,
    mirror.mirror_divergence,
    mirror.infra_fix_needed,
    (SELECT count(*) AS count FROM evo.evolution_webhook_events_v2 WHERE evolution_webhook_events_v2.created_at > (now() - '24:00:00'::interval)) AS source_events_24h,
    (SELECT count(*) AS count FROM evo.evolution_messages WHERE evolution_messages.created_at > (now() - '24:00:00'::interval)) AS persisted_msgs_24h,
    hl.health_log_at,
    hl.health_log_status,
    hl.gap_inbound_min,
    hl.webhook_events_1h,
    hl.probe_status,
    hl.probe_latency_ms,
    cr.cron_runs_24h,
    cr.cron_succeeded_24h,
    cr.cron_failed_24h,
    cr.cron_jobs_24h,
    cr.cron_last_run_at,
    cr.cron_failed_jobs,
    cs.consumer_ok_count AS consumer_ok_count_last,
    cs.consumer_filas AS consumer_filas_last,
    cs.consumer_stats_at,
    (SELECT count(*) AS count FROM _consumer_dlq) AS consumer_dlq_rows,
    (SELECT count(*) AS count FROM evo.evolution_api_consumers WHERE evolution_api_consumers.status = 'active'::text) AS api_consumers_active,
    ch.consumer_halt_last_status,
    o401.http_401_hits_24h,
    o401.http_401_unique_ips,
    o401.http_401_last_seen,
    sc.total_messages,
    sc.total_contacts,
    sc.total_conversations,
    sc.open_alerts,
    sc.bootstrap_needed_24h,
    sc.scorecard_at,
    CASE
        WHEN pipe.pipeline_status = 'CRITICAL'::text OR (mirror.v2_status = ANY (ARRAY['critical'::text, 'dead'::text])) OR cr.cron_failed_24h > 0 OR hl.probe_status <> 'ok'::text THEN 'CRITICAL'::text
        WHEN pipe.pipeline_status = 'DEGRADED'::text OR mirror.v2_status = 'degraded'::text OR sc.open_alerts > 0 OR ((SELECT count(*) AS count FROM _consumer_dlq)) > 0 THEN 'DEGRADED'::text
        ELSE 'HEALTHY'::text
    END AS overall_status
FROM pipe, mirror, hl, cs, cr, ch, o401, sc;
ALTER VIEW evo.v_health_unified SET (security_invoker = true);
COMMENT ON VIEW evo.v_health_unified IS 'Painel unico de saude (D-3 runbook-2 06/08): pipeline ingest, mirror v2, health log, crons 24h, consumer, 401, scorecard. Uso interno (evo fora do PGRST_DB_SCHEMAS).';

-- ---------------------------------------------------------------------------
-- D-9: evo.v_kpi_overview — KPIs/SLAs (gap sync, cobertura mirror, msgs/hora,
-- latência webhook→DB, dedup, %401, DLQ). security_invoker=true.
-- ---------------------------------------------------------------------------
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
