# Registro de Crons (`pg_cron`)

**Retrato de:** 27/07/2026 · **80 jobs ativos** · saúde 7 dias: **22.239 sucessos / 7 falhas (0,03%)**.

> Regra: todo `command` de cron deve ser **qualificado** com `schema.função`. Hoje há 1 exceção (job 15).
> Regenerar: `SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;`

## Jobs críticos (ler antes de mexer)

| Job | Função | Por quê é crítico |
|---|---|---|
| `ensure-evolution-backcompat-views` (138) | `evo.fn_ensure_evolution_backcompat_views` | **Recria as views de compat a cada 6h.** Ver `BACKCOMPAT-VIEWS.md`. |
| `auto-create-monthly-partitions` (64) | `evo.fn_auto_create_next_partitions` | Cria as partições mensais de `evolution_*`. Não criar partição à mão. |
| `daily-backup-sentinel-check` (127) | `ops.fn_auto_update_backup_sentinel` | Sentinela de backup (DR). Não mexer. |
| `restore-integrity-check` (143) | `zapp.fn_restore_integrity_check` | Valida integridade de restore (DR). Não mexer. |
| `wal-slot-monitor` (122) | `ops.fn_check_wal_slots` | Monitora lag de slot WAL (já causou incidente). |

## Registro completo

| Job | Nome | Schedule | Dono | Comando/propósito |
|---:|---|---|---|---|
| 4 | auto-offline-agents | `2-59/5 * * * *` | zapp | `fn_auto_offline_agents` |
| 5 | retry-stuck-messages | `*/10 * * * *` | zapp | `fn_retry_stuck_messages` |
| 6 | refresh-daily-metrics | `0 */1 * * *` | zapp | `rpc_refresh_daily_metrics` |
| 9 | expire-old-media-queue | `0 4 * * *` | zapp | `fn_expire_old_media_queue` |
| 10 | retry-stuck-media-queue | `*/10 * * * *` | zapp | `fn_retry_stuck_media_queue` |
| 11 | refresh-top-stickers | `30 * * * *` | zapp | `rpc_refresh_top_stickers` |
| 12 | sync-r2-lifecycle | `0 5 * * *` | zapp | `fn_handle_expired_r2_media` (🌐 R2) |
| 15 | email_tracking_cleanup_weekly | `0 3 * * 0` | ⚠️ não-qualif. | `rpc_email_cleanup_old_events(90)` — **qualificar** |
| 17 | reprocess_pending_webhooks | `1-59/2 * * * *` | zapp | `fn_reprocess_pending_webhook_events(200)` |
| 27 | whatsapp_reconcile_dispatch | `*/5 * * * *` | zapp | `fn_reconcile_dispatch` |
| 30 | whatsapp_reconcile_apply | `1-59/5 * * * *` | zapp | `fn_reconcile_apply` |
| 32 | whatsapp_connection_drift_alert | `4-59/5 * * * *` | zapp | `fn_alert_connection_drift` |
| 33 | message_pipeline_stalled_alert | `0 8-22 * * *` | zapp | `fn_alert_message_pipeline_stalled` |
| 34 | evolution-pipeline-health-check | `4-59/5 * * * *` | zapp | `fn_check_evolution_pipeline_health` |
| 35 | evolution-jid-health-check-5min | `3-59/5 * * * *` | zapp | `fn_check_evolution_jid_health` |
| 41 | scan-media-security | `1-59/5 * * * *` | zapp | `fn_process_pending_scans(100)` |
| 43 | process_pending_followups | `*/5 * * * *` | zapp | `fn_process_pending_followups` |
| 44 | refresh_mv_daily_kpis | `0 * * * *` | evo | `REFRESH MATVIEW CONCURRENTLY evo.mv_daily_kpis` |
| 51 | vault_healthcheck | `*/15 * * * *` | zapp | `fn_vault_healthcheck_run` |
| 52 | vault_healthcheck_cleanup | `0 4 * * *` | zapp | `fn_vault_healthcheck_cleanup` |
| 54 | purge-processed-webhook-events | `30 3 * * *` | zapp | `fn_purge_processed_webhook_events(30,5000)` |
| 55 | pipeline-watchdog | `0 */4 * * *` | zapp | `fn_pipeline_watchdog` |
| 57 | system-health-score | `0 * * * *` | zapp | `fn_system_health_score` |
| 61 | purge_webhook_audit | `15 4 * * *` | zapp | purge de `webhook_audit_log` (>3 dias) |
| 63 | db_size_snapshot | `0 6 * * *` | zapp | snapshot em `zapp._db_size_snapshots` |
| 64 | auto-create-monthly-partitions | `0 0 1 * *` | evo | `fn_auto_create_next_partitions` |
| 65 | purge_evolution_alerts | `0 4 * * *` | evo | purge de `evolution_alerts` |
| 66 | purge_realtime_events | `45 4 * * *` | evo | purge `evolution_realtime_events` (>7 dias) |
| 67 | whatsapp_reconcile_cleanup | `17 3 * * *` | evo | limpa `evolution_reconcile_jobs` |
| 68 | whatsapp_reconcile_reaper | `*/3 * * * *` | evo | reaper de `evolution_reconcile_jobs` |
| 71 | cleanup-old-notifications | `0 3 * * *` | zapp | `fn_cleanup_old_notifications` |
| 73 | escalate-critical-alerts | `*/10 * * * *` | zapp | `fn_escalate_critical_alerts` |
| 76 | link-orphan-messages | `4-59/5 * * * *` | evo | `fn_link_orphan_messages(5000)` |
| 78 | analyze-catalogo-diario | `0 6 * * *` | — | ANALYZE do catálogo |
| 82 | ops-guardrails-deadman | `*/10 * * * *` | ops | `fn_guardrails_check` |
| 84 | ops-notify-critical-alerts | `*/5 * * * *` | ops | `fn_notify_critical_alerts` |
| 86 | purge_query_telemetry_daily | `0 3 * * *` | zapp | `purge_old_query_telemetry(30)` |
| 87 | route-failed-webhooks-to-dlq | `*/10 * * * *` | zapp | `fn_route_failed_webhooks_to_dlq` |
| 88 | archive-old-wpp2-messages | `0 3 1 * *` | zapp | `fn_archive_old_wpp2_messages(12m)` |
| 89 | ops-payload-retention | `15 3 1 * *` | ops | `fn_payload_retention(60,false)` |
| 90 | purge-media-queue-and-scan-log | `45 3 * * *` | zapp | purge `media_download_queue` |
| 91 | monitor-dlq-health | `*/30 * * * *` | zapp | `fn_monitor_dlq_health(10)` |
| 94 | ops-ddl-weekly-summary | `0 8 * * 1` | ops | `fn_ddl_weekly_summary` |
| 95 | catalog-sanity-weekly | `0 5 * * 1` | ops | `fn_catalog_sanity_check` |
| 96 | sync-instance-registry-status | `2-59/5 * * * *` | zapp | `fn_sync_instance_registry_status` |
| 97 | alert-ghost-message-events | `*/5 * * * *` | zapp | `fn_alert_ghost_message_events` |
| 99 | cleanup-cron-job-history | `0 3 * * *` | cron | purge `cron.job_run_details` (>3 dias) |
| 101 | qr-attempts-expire-15min | `*/15 * * * *` | zapp | expira `qr_attempts` |
| 102 | slow_query_monitor_hourly | `0 * * * *` | zapp | `fn_monitor_slow_queries(500,50)` |
| 103 | pg_stat_statements_weekly_reset | `0 2 * * 0` | zapp | snapshot + reset `pg_stat_statements` |
| 104 | wpp2_disconnection_watchdog | `*/10 6-23 * * *` | zapp | `fn_alert_wpp2_disconnection` |
| 105 | infra_check_hourly | `0 * * * *` | ops | `check_infrastructure` |
| 106 | run_all_checks_daily | `0 7 * * *` | ops | `run_all_checks` |
| 107 | performance_report_weekly | `0 6 * * 1` | zapp | snapshot em `query_telemetry` |
| 108 | health_score_alert_hourly | `30 * * * *` | zapp | `fn_alert_health_score_degraded(70)` |
| 111 | regression_tests_daily | `0 8 * * *` | ops | `fn_regression_tests` |
| 113 | bloat_alert_4h | `0 */4 * * *` | zapp | `fn_alert_table_bloat(15)` |
| 115 | redis_sentinel_refresh_5min | `*/5 * * * *` | ops | atualiza `ops.redis_sentinel` |
| 116 | purge-webhook-rate-limits-2h | `0 * * * *` | zapp | purge `webhook_rate_limits` |
| 117 | analyze_critical_tables | `30 3 * * *` | zapp | `fn_force_autovacuum` nas críticas |
| 120 | wpp2-session-expiry-watchdog | `*/15 * * * *` | zapp | alerta em `warroom_alerts` |
| 122 | wal-slot-monitor | `*/15 * * * *` | ops | `fn_check_wal_slots` |
| 123 | weekly-edge-fn-freshness | `0 12 * * 1` | ops | `fn_edge_fn_staleness_check` (🌐 edge) |
| 124 | daily-wa-marketing-budget | `0 12 * * *` | ops | `check_marketing_budget` |
| 126 | types-drift-weekly | `0 13 * * 1` | ops | grava `ops.schema_drift_log` |
| 127 | daily-backup-sentinel-check | `0 12 * * *` | ops | `fn_auto_update_backup_sentinel` (DR) |
| 128 | security_acl_email_check | `*/30 * * * *` | zapp | `fn_security_acl_master_check` |
| 129 | cron-log-daily-purge | `30 2 * * *` | cron | purge `cron.job_run_details` (>48h) |
| 131 | guardian-heartbeat-sync | `2-59/5 * * * *` | evo | `fn_sync_guardian_heartbeat` |
| 133 | vacuum-alerts-daily | `6 2 * * *` | evo | `VACUUM ANALYZE evolution_alerts` |
| 135 | vacuum-bootstrap-log-daily | `16 2 * * *` | evo | `VACUUM ANALYZE evolution_bootstrap_log` |
| 136 | vacuum-connection-history-daily | `21 2 * * *` | evo | `VACUUM ANALYZE evolution_connection_history` |
| 137 | monthly-evo-audit | `0 6 1 * *` | evo | `fn_monthly_evo_audit` |
| 138 | ensure-evolution-backcompat-views | `0 */6 * * *` | evo | **recria views de compat** (crítico) |
| 139 | cache-warmup-after-vacuum | `35 2 * * *` | evo | `fn_cache_warmup_after_vacuum` |
| 142 | check-media-pipeline-health | `*/15 11-23 * * *` | zapp | `fn_check_media_pipeline_health` |
| 143 | restore-integrity-check | `0 11 * * *` | zapp | `fn_restore_integrity_check` (DR) |
| 145 | burnin-monitor | `*/15 * * * *` | evo | `fn_burnin_monitor` |
| 146 | dlq-poison-guard | `*/5 * * * *` | evo | `fn_flag_poison_messages` |

## Convenção de offset (anti thundering-herd)

Jobs de 5/5 min usam offsets escalonados para não colidirem no mesmo minuto: `1-59/5`, `2-59/5`, `3-59/5`, `4-59/5`. Preserve esse padrão ao adicionar jobs de alta frequência.
