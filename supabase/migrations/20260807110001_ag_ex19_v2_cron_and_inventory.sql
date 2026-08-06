-- ============================================================================
-- AG-EX-19 — parte 2 aplicada como migration separada (divisão operacional)
-- 20260807110001_ag_ex19_v2_cron_and_inventory.sql
--
-- Motivo da divisão: o apply_migration do MCP foi chamado em 2 partes para
-- reduzir o tamanho do payload. A parte 1 (20260807110000) criou as funções
-- e a view evo.v_wpp2_uptime_24h; esta parte contém:
--   * evo.v_kpi_overview estendido (colunas wpp2_* ADICIONADAS NO FINAL —
--     CREATE OR REPLACE VIEW não permite reordenar colunas existentes);
--   * UPDATEs em cron.job (161/163 reescritos, 104/120 desativados);
--   * upsert no zapp.cron_inventory (itens 25/28/29/30).
-- Tudo idempotente (CREATE OR REPLACE / UPDATE / ON CONFLICT DO UPDATE).
-- ============================================================================

CREATE OR REPLACE VIEW evo.v_kpi_overview
WITH (security_invoker = true) AS
WITH probe AS (
  SELECT checked_at, pipeline_status, gap_inbound_min
  FROM evo.evolution_pipeline_health_log
  WHERE notes LIKE 'probe-15min%'
  ORDER BY checked_at DESC
  LIMIT 1
),
reconcile AS (
  SELECT checked_at, notes
  FROM evo.evolution_pipeline_health_log
  WHERE notes LIKE 'reconcile-source-mirror%'
  ORDER BY checked_at DESC
  LIMIT 1
),
msgs AS (
  SELECT
    count(*) FILTER (WHERE created_at >= now() - interval '1 hour') AS msgs_1h,
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS msgs_24h,
    max(created_at) AS last_ingest
  FROM evo.evolution_messages
),
audit AS (
  SELECT
    round(avg(duration_ms) FILTER (WHERE duration_ms IS NOT NULL), 1) AS avg_ms,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms::double precision)::numeric, 1) AS p95_ms,
    count(*) AS n_24h
  FROM zapp.webhook_audit_log
  WHERE created_at >= now() - interval '24 hours'
),
dlq AS (
  SELECT
    (SELECT count(*) FROM evo.evolution_webhook_dlq WHERE status = 'pending') AS dlq_evo_pending,
    (SELECT count(*) FROM zapp._consumer_dlq WHERE status IN ('pending','error','failed')) AS dlq_consumer_open
),
dedup AS (
  SELECT count(*) AS failures_24h FROM evo.v_dedup_failures
),
ipw AS (
  SELECT
    count(*) AS hits_24h,
    count(*) FILTER (WHERE http_status = 401) AS hits_401
  FROM evo.evolution_ip_watch
  WHERE created_at >= now() - interval '24 hours'
),
up AS (
  SELECT * FROM evo.v_wpp2_uptime_24h
)
SELECT
  now() AS checked_at,
  p.gap_inbound_min AS gap_sync_min,
  p.pipeline_status AS gap_sync_status,
  p.checked_at AS gap_sync_checked_at,
  CASE WHEN r.notes ~ 'msg=[0-9.]+%' THEN (regexp_match(r.notes, 'msg=([0-9.]+)%'))[1]::numeric ELSE NULL END AS mirror_msg_coverage_pct,
  r.checked_at AS mirror_coverage_checked_at,
  m.last_ingest AS last_ingest_at,
  m.msgs_1h,
  m.msgs_24h,
  round(m.msgs_24h::numeric / 24.0, 1) AS msgs_per_hour_avg_24h,
  d.failures_24h AS dedup_failures_24h,
  (SELECT count(*) FROM zapp.webhook_event_dedup) AS dedup_tracked_rows,
  a.avg_ms AS webhook_latency_avg_ms_24h,
  a.p95_ms AS webhook_latency_p95_ms_24h,
  a.n_24h AS webhook_events_24h,
  CASE WHEN ipw.hits_24h > 0 THEN round(100.0 * ipw.hits_401::numeric / ipw.hits_24h::numeric, 2) ELSE NULL END AS pct_401_24h,
  ipw.hits_24h AS ipwatch_hits_24h,
  q.dlq_evo_pending,
  q.dlq_consumer_open,
  q.dlq_evo_pending + q.dlq_consumer_open AS dlq_total_open,
  NULL::numeric AS rabbitmq_backlog_messages,
  NULL::integer AS consumer_drop_total,
  'FONTES EXTERNAS: rabbitmq_backlog_messages -> rabbitmqctl list_queues (container rabbitmq) ou API :15672; consumer_drop_total -> logs evolution-rabbit-consumer [STATS] drop=N; pct_401_24h -> evolution_ip_watch sem dados (0 linhas, sem trigger): usar access log Traefik (grep DownstreamStatus=401). wpp2_uptime_pct_24h -> evo.evolution_connection_history (spans connected/open, AG-EX-19).'::text AS notas,
  up.uptime_pct_24h AS wpp2_uptime_pct_24h,
  up.connects_24h AS wpp2_connects_24h,
  up.disconnects_24h AS wpp2_disconnects_24h,
  up.last_conn_event_at AS wpp2_last_conn_event_at
FROM probe p
  CROSS JOIN reconcile r
  CROSS JOIN msgs m
  CROSS JOIN audit a
  CROSS JOIN dlq q
  CROSS JOIN dedup d
  CROSS JOIN ipw ipw
  CROSS JOIN up;

UPDATE cron.job
SET jobname = 'evo-wpp2-401-disconnect-feed',
    command = 'SELECT evo.fn_feed_401_disconnect_alerts()'
WHERE jobid = 161;

UPDATE cron.job
SET jobname = 'evo-wpp2-uptime-kpi',
    command = 'SELECT evo.fn_wpp2_uptime_kpi()'
WHERE jobid = 163;

UPDATE cron.job SET active = false WHERE jobid = 104;
UPDATE cron.job SET active = false WHERE jobid = 120;

INSERT INTO zapp.cron_inventory (jobid, jobname, owner, purpose, sla, status, replaced_by, nota, atualizado_em) VALUES
(104, 'wpp2_disconnection_watchdog', 'supabase', 'Alerta desconexao wpp2 (whatsapp_connections >30min)', '10min', 'desativado', 161,
  'AG-EX-19 item 25: redundante com watchdog-baileys (canonico, estado via API 5min) + evo.fn_feed_401_disconnect_alerts (job 161). Dry-run 06/08: connected->ok; 25 alertas wpp2_disconnection abertos sem resolucao (spam).', now()),
(120, 'wpp2-session-expiry-watchdog', 'supabase', 'Alerta sessao expirada (health_status != healthy >15min)', '15min', 'desativado', 161,
  'AG-EX-19 item 25: fonte ineficaz - health_status deriva de gap de MENSAGENS (fn_update_instance_health/job 172), nao de estado de conexao; nao disparou no outage 05-06/08 (ultimo alerta 25/07). Coberto por watchdog-baileys + job 161.', now()),
(35, 'evolution-jid-health-check-5min', 'supabase', 'Qualidade JID de mensagens (NAO e watchdog de conexao)', '5min', 'mantido', NULL,
  'AG-EX-19 item 25: mantido - sem overlap com watchdog-baileys (dominio: integridade JID de evolution_messages).', now()),
(160, 'evo-swarm-duplicate-detector', 'supabase', 'Safety net duplicacao de task swarm (heartbeat burst + double-open)', '30min', 'mantido', NULL,
  'AG-EX-19 item 28: validado - mudo por design (unico writer de evo.evolution_guardian_heartbeat = pg-cron-liveness job 193; 559 runs succeeded/3d; 0 alertas swarm_task_duplicate em 14d). Manter.', now()),
(161, 'evo-wpp2-401-disconnect-feed', 'supabase', 'Feed desconexoes/401 em evolution_connection_history (>=3/15min) -> webhook_health_alerts (sentry_401_feed, integracao job 173) + evolution_alerts (entrega 73/84). SEM auto-reconnect (enforcement #2248)', '10min', 'mantido', NULL,
  'AG-EX-19 item 29: reescrito (era evo-401-feed no-op: evolution_ip_watch vazia). Item 85 (AG-EX-17, migracao 20260807091000) criou fn_get_401_payload_v2 (so registro); esta migration adicionou entrega real via evolution_alerts critical (fn_feed_401_disconnect_alerts). Sem auto-reconnect.', now()),
(163, 'evo-wpp2-uptime-kpi', 'supabase', 'KPI uptime 24h + pico (11-21Z seg-sex) de evolution_connection_history; alerta SLA 99/95%', '15min', 'mantido', NULL,
  'AG-EX-19 item 30: re-apontado (era evo-peak-hours-sla NO_PEAK_DATA eterno: evolution_health_logs com 1 linha). KPI na view evo.v_wpp2_uptime_24h + colunas em evo.v_kpi_overview.', now())
ON CONFLICT (jobid) DO UPDATE SET
  jobname = EXCLUDED.jobname,
  owner = EXCLUDED.owner,
  purpose = EXCLUDED.purpose,
  sla = EXCLUDED.sla,
  status = EXCLUDED.status,
  replaced_by = EXCLUDED.replaced_by,
  nota = EXCLUDED.nota,
  atualizado_em = EXCLUDED.atualizado_em;
