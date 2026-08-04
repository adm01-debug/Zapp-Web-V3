# FASE 2 — Enumeração Completa do Backend Supabase (Censo de Objetos e Estado do Banco)

**Projeto:** zapp-web-v3 · **Banco:** Supabase self-hosted (PostgreSQL 15.8)
**Coletado em:** 2026-08-04 (sessão de auditoria de reconciliação)
**Método:** SQL read-only via MCP `supabase_db_query` (endpoint `supabase-mcp.atomicabr.com.br/s-a50174164e4b03ef181a29db65d2db80/mcp`)
**Regras:** apenas SELECT; toda evidência acompanhada do SQL executado e do resultado.
**Arquivo:** `docs/reconciliation/02_backend.md` (+ `02_backend.json`)

---

## Resumo executivo (destaques)

| # | Achado | Status |
|---|--------|--------|
| 1 | **Censo zapp confirma referência**: 321 tabelas / 380 views / 5 matviews / **1066 funções** (referência: 321/380/~1060 — confirma; funções +6 vs ~1060, provável sobrecarga/novas) | ✅ CONFIRMADO |
| 2 | **Extensões (21 instaladas)**: pg_cron, pg_net, pgcrypto, uuid-ossp, pg_graphql, vector, pgjwt, pgsodium, supabase_vault, pgmq, wrappers, unaccent, pg_trgm, btree_gin, hypopg, index_advisor, pg_buffercache, pg_stat_statements, amcheck, dblink, plpgsql — **`http` AUSENTE** (única ausente do conjunto padrão Supabase que RPCs podem exigir; pg_net cobre `net.http_*`, mas se houver RPC usando `http.*` falha) | ⚠️ ATENÇÃO |
| 3 | **Cron: 146 jobs, TODOS ativos** (referência ~146 — confirma; nenhum inativo) | ✅ CONFIRMADO |
| 4 | **Realtime: 68 tabelas publicadas** (zapp 50, evo 12, email_app 5, financeiro 1) | ✅ OK |
| 5 | **Replication slots: 2, ambos ativos** (`wal_status=reserved`); nenhum inativo | ✅ OK |
| 6 | **Storage: 13 buckets** (6 públicos: audio-memes, avatars, custom-emojis, recibos-entrega, stickers + whatsapp-media é privado) | ✅ OK |
| 7 | **Auth: 19 users / 19 profiles / 14 identities** (13 email + 1 google) — **5 usuários sem identity** (gap a investigar) | ⚠️ GAP |
| 8 | **Migrations: 92 registradas**; última `20260804140000` (fix_rls_delta_corrigido); squash `canonical_schema_squash_133_migrations` presente | ✅ OK |
| 9 | **GUCs `app.%`/`pgrst.%`: nenhum** em `pg_settings` (configurados no PostgREST, não no banco) | ℹ️ INFO |
| 10 | **Vault: 30 secrets** | ✅ OK |
| 11 | **Schemas: 35 regulares + 212 temporários** (106 `pg_temp_*` + 106 `pg_toast_temp_*` — indica ~106 backends ativos via pooling) | ℹ️ INFO |
| 12 | **Schemas inesperados/extra**: `ai` (31 tabelas), `ops`, `monitoring`, `graveyard`, `parity_audit`, `_backups`, `archive`, `vendas`, `logistica`, `financeiro`, `artes`, `bpm`, `email_app`, `evo` | ℹ️ INFO |
| 13 | **`public` com 511 views / 4 tabelas** (muitas views de exposição; conferir se todas são necessárias) | ℹ️ INFO |

---

## Etapa 23 — Versão e tempo de atividade

**SQL:**
```sql
SELECT version(), pg_postmaster_start_time()
```

**Resultado (1 linha):**

| version | pg_postmaster_start_time |
|---|---|
| PostgreSQL 15.8 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 13.2.0, 64-bit | 2026-07-31T18:36:45.535Z |

**Análise:** PG 15.8 compatível com o esperado; postmaster iniciado em 31/07/2026 (~4 dias de uptime na coleta).

---

## Etapa 24 — Extensões instaladas

**SQL:**
```sql
SELECT extname, extversion FROM pg_extension ORDER BY 1
```

**Resultado (21 linhas):**

| extname | extversion | Observação |
|---|---|---|
| amcheck | 1.3 | |
| btree_gin | 1.3 | |
| dblink | 1.2 | habilitada em 02/08 (migration `enable_dblink`) |
| hypopg | 1.4.1 | |
| index_advisor | 0.2.0 | |
| pg_buffercache | 1.3 | |
| pg_cron | 1.6 | ✅ presente |
| pg_graphql | 1.5.11 | ✅ presente |
| pg_net | 0.14.0 | ✅ presente |
| pg_stat_statements | 1.10 | |
| pg_trgm | 1.6 | |
| pgcrypto | 1.3 | ✅ presente |
| pgjwt | 0.2.0 | ✅ presente |
| pgmq | 1.4.4 | |
| pgsodium | 3.1.8 | |
| plpgsql | 1.0 | |
| supabase_vault | 0.3.1 | ✅ presente |
| unaccent | 1.1 | |
| uuid-ossp | 1.1 | ✅ presente |
| vector | 0.8.0 | ✅ presente |
| wrappers | 0.4.6 | |

**Análise — ausências relevantes:**
- ❌ **`http` AUSENTE** — presente no Supabase Cloud padrão. Se algum RPC/edge function usar `http.*` (ex.: `http_post`, `http_get`), falhará. `pg_net` (schema `net`, 10 funções) cobre a maioria dos casos (`net.http_*`); verificar na fase de auditoria de RPCs se há dependência de `http`.
- Ausentes também (não críticas): `postgis`, `pg_repack`, `pgtap`, `pg_stat_monitor`, `plv8`.

---

## Etapa 25 — Roles e search_path

**SQL:**
```sql
SELECT rolname FROM pg_roles ORDER BY 1
```

**Resultado (29 roles):**

| Roles |
|---|
| anon, authenticated, authenticator, dashboard_user, pg_checkpoint, pg_database_owner, pg_execute_server_program, pg_monitor, pg_read_all_data, pg_read_all_settings, pg_read_all_stats, pg_read_server_files, pg_signal_backend, pg_stat_scan_tables, pg_write_all_data, pg_write_server_files, pgbouncer, pgsodium_keyholder, pgsodium_keyiduser, pgsodium_keymaker, postgres, service_role, supabase_admin, supabase_auth_admin, supabase_functions_admin, supabase_read_only_user, supabase_realtime_admin, supabase_replication_admin, supabase_storage_admin |

**SQL (settings por role):**
```sql
SELECT r.rolname, s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole ORDER BY 1
```

**Resultado (9 roles com settings):**

| rolname | setconfig |
|---|---|
| anon | `statement_timeout=5s`, `search_path=evo, public, extensions`, `idle_in_transaction_session_timeout=60s` |
| authenticated | `statement_timeout=15s`, `search_path=zapp, evo, public, extensions`, `idle_in_transaction_session_timeout=60s`, `lock_timeout=10s` |
| authenticator | `session_preload_libraries=safeupdate`, `statement_timeout=8s`, `lock_timeout=8s`, `TimeZone=America/Sao_Paulo`, `search_path="$user", public, evo, zapp, bpm, email_app, monitoring, extensions` |
| postgres | `search_path="$user", public, evo, zapp, bpm, email_app, monitoring, extensions`, `TimeZone=America/Sao_Paulo`, `idle_in_transaction_session_timeout=60s`, `enable_partitionwise_join=on`, `enable_partitionwise_aggregate=on`, `track_io_timing=on`, `statement_timeout=120s` |
| service_role | `TimeZone=America/Sao_Paulo`, `search_path=zapp, evo, public, extensions`, `idle_in_transaction_session_timeout=300s`, `statement_timeout=60s` |
| supabase_admin | `search_path="$user", public, auth, extensions` |
| supabase_auth_admin | `search_path=auth`, `idle_in_transaction_session_timeout=60000` |
| supabase_functions_admin | `search_path=supabase_functions` |
| supabase_storage_admin | `search_path=storage` |

**Análise:**
- ⚠️ **`anon` NÃO tem `zapp` no search_path** (`evo, public, extensions`) enquanto `authenticated` e `service_role` têm `zapp, evo, public, extensions`. Se RPCs de `zapp` forem chamadas como `anon` sem qualificação explícita de schema, quebram.
- `supabase_realtime_admin` e `supabase_replication_admin` existem sem settings explícitos (padrão).
- Timezone `America/Sao_Paulo` consistente nas roles de app.

---

## Etapa 26 — Schemas (namespaces)

**SQL:**
```sql
SELECT nspname FROM pg_namespace ORDER BY 1
```

**Resultado:** 247 namespaces = **35 regulares + 106 `pg_temp_*` + 106 `pg_toast_temp_*`** (212 temporários — ~106 backends ativos via pooling).

**SQL (classificação):**
```sql
SELECT count(*) FILTER (WHERE nspname LIKE 'pg\_temp\_%') AS temp_schemas,
       count(*) FILTER (WHERE nspname LIKE 'pg\_toast\_temp\_%') AS toast_temp_schemas,
       count(*) FILTER (WHERE nspname NOT LIKE 'pg\_temp\_%' AND nspname NOT LIKE 'pg\_toast\_temp\_%') AS regular_schemas
FROM pg_namespace
```

**Schemas regulares (35):**

| Categoria | Schemas |
|---|---|
| Supabase core | auth, storage, realtime, `_realtime`, supabase_functions, supabase_migrations, cron, net, graphql, graphql_public, pgmq, pgsodium, pgsodium_masks, vault, pgbouncer, extensions, public, pg_catalog, information_schema, pg_toast |
| App principal | **zapp**, evo, bpm, email_app, financeiro, vendas, logistica, artes |
| Operacional/auditoria | ops, monitoring, `parity_audit`, `graveyard`, `_backups`, archive |
| AI/vector | **ai** (31 tabelas — schema do Supabase AI / pgvector) |

**Análise — schemas inesperados/notáveis:**
- `graveyard` e `parity_audit`: provavelmente artefatos de auditoria/migração anterior — conferir se ainda necessários.
- `ai` (31 tabelas): schema de AI do Supabase (geralmente `ai` + extensão `vector`); presente.
- 212 namespaces temporários (106 sessões) — volume alto de conexões (esperado com PgBouncer transaction pooling); sem impacto, mas monitorar.

---

## Etapa 27 — Censo de objetos por schema

**SQL:**
```sql
SELECT nspname,
       count(*) FILTER (WHERE relkind='r') AS tables,
       count(*) FILTER (WHERE relkind='v') AS views,
       count(*) FILTER (WHERE relkind='m') AS matviews,
       count(*) FILTER (WHERE relkind='p') AS partitioned
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE nspname NOT IN ('pg_catalog','information_schema')
GROUP BY 1 ORDER BY 1
```

**Resultado (29 schemas):**

| nspname | tables | views | matviews | partitioned |
|---|---|---|---|---|
| _backups | 4 | 0 | 0 | 1 |
| _realtime | 4 | 0 | 0 | 0 |
| ai | 31 | 0 | 0 | 0 |
| archive | 36 | 0 | 0 | 0 |
| artes | 2 | 1 | 0 | 0 |
| auth | 24 | 0 | 0 | 0 |
| bpm | 41 | 0 | 0 | 0 |
| cron | 2 | 0 | 0 | 0 |
| email_app | 33 | 0 | 0 | 0 |
| evo | 169 | 16 | 3 | 3 |
| extensions | 1 | 2 | 0 | 0 |
| financeiro | 16 | 11 | 0 | 0 |
| graphql | 0 | 0 | 0 | 0 |
| logistica | 3 | 0 | 0 | 0 |
| monitoring | 1 | 13 | 0 | 0 |
| net | 2 | 0 | 0 | 0 |
| ops | 31 | 6 | 1 | 0 |
| parity_audit | 2 | 0 | 0 | 0 |
| pg_toast | 0 | 0 | 0 | 0 |
| pgmq | 1 | 0 | 0 | 0 |
| pgsodium | 1 | 4 | 0 | 0 |
| public | 4 | **511** | 0 | 0 |
| realtime | 13 | 0 | 0 | 1 |
| storage | 10 | 0 | 0 | 0 |
| supabase_functions | 2 | 0 | 0 | 0 |
| supabase_migrations | 1 | 0 | 0 | 0 |
| vault | 2 | 1 | 0 | 0 |
| vendas | 14 | 5 | 0 | 0 |
| **zapp** | **321** | **380** | **5** | 0 |

**SQL (funções por schema):**
```sql
SELECT n.nspname, count(*) AS functions
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE nspname NOT IN ('pg_catalog','information_schema')
GROUP BY 1 ORDER BY 1
```

**Resultado (22 schemas com funções):**

| nspname | functions |
|---|---|
| archive | 2 |
| artes | 15 |
| auth | 4 |
| cron | 7 |
| evo | 69 |
| extensions | 100 |
| financeiro | 45 |
| graphql | 6 |
| graphql_public | 1 |
| monitoring | 2 |
| net | 10 |
| ops | 64 |
| pgbouncer | 1 |
| pgmq | 28 |
| pgsodium | 137 |
| public | 148 |
| realtime | 14 |
| storage | 17 |
| supabase_functions | 1 |
| vault | 5 |
| vendas | 21 |
| **zapp** | **1066** |
| **TOTAL** | **1763** |

**Análise — vs referência esperada:**
- ✅ **zapp: 321 tabelas / 380 views — CONFIRMA exatamente a referência (321/380).**
- ✅ **zapp: 1066 funções** vs ~1060 esperado (+6, diferença pequena — provável sobrecarga de função ou funções novas desde o baseline; conferir na fase de reconciliação de RPCs).
- ℹ️ `public` com **511 views** é atípico — provável camada de views de exposição (backcompat) para o frontend; auditar necessidade.
- ℹ️ `evo`: 169 tabelas + 16 views + 3 matviews (3 particionadas) — schema grande do Evolution API.

---

## Etapa 28 — Cron jobs (pg_cron)

**SQL:**
```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY 1
```

**Resultado: 146 jobs — TODOS `active=true`. Nenhum inativo.**

| jobid | jobname | schedule | active |
|---|---|---|---|
| 4 | auto-offline-agents | 2-59/5 * * * * | true |
| 5 | retry-stuck-messages | */10 * * * * | true |
| 6 | refresh-daily-metrics | 0 */1 * * * | true |
| 9 | expire-old-media-queue | 0 4 * * * | true |
| 10 | retry-stuck-media-queue | */10 * * * * | true |
| 11 | refresh-top-stickers | 30 * * * * | true |
| 12 | sync-r2-lifecycle | 0 5 * * * | true |
| 15 | email_tracking_cleanup_weekly | 0 3 * * 0 | true |
| 17 | reprocess_pending_webhooks | 1-59/2 * * * * | true |
| 27 | whatsapp_reconcile_dispatch | */5 * * * * | true |
| 30 | whatsapp_reconcile_apply | 1-59/5 * * * * | true |
| 32 | whatsapp_connection_drift_alert | 4-59/5 * * * * | true |
| 33 | message_pipeline_stalled_alert | 0 8-22 * * * | true |
| 34 | evolution-pipeline-health-check-bateria10 | 4-59/5 * * * * | true |
| 35 | evolution-jid-health-check-5min | 3-59/5 * * * * | true |
| 41 | scan-media-security | 1-59/5 * * * * | true |
| 43 | process_pending_followups | */5 * * * * | true |
| 51 | vault_healthcheck | */15 * * * * | true |
| 52 | vault_healthcheck_cleanup | 0 4 * * * | true |
| 54 | purge-processed-webhook-events | 30 3 * * * | true |
| 55 | pipeline-watchdog | 0 */4 * * * | true |
| 57 | system-health-score | 0 * * * * | true |
| 61 | purge_webhook_audit | 15 4 * * * | true |
| 63 | db_size_snapshot | 0 6 * * * | true |
| 64 | auto-create-monthly-partitions | 0 0 1 * * | true |
| 65 | purge_evolution_alerts | 0 4 * * * | true |
| 66 | purge_realtime_events | 45 4 * * * | true |
| 67 | whatsapp_reconcile_cleanup | 17 3 * * * | true |
| 68 | whatsapp_reconcile_reaper | */3 * * * * | true |
| 71 | cleanup-old-notifications | 0 3 * * * | true |
| 73 | escalate-critical-alerts | */10 * * * * | true |
| 76 | link-orphan-messages | 4-59/5 * * * * | true |
| 78 | analyze-catalogo-diario | 0 6 * * * | true |
| 82 | ops-guardrails-deadman | */10 * * * * | true |
| 84 | ops-notify-critical-alerts | */5 * * * * | true |
| 86 | purge_query_telemetry_daily | 0 3 * * * | true |
| 88 | archive-old-wpp2-messages | 0 3 1 * * | true |
| 89 | ops-payload-retention | 15 3 1 * * | true |
| 90 | purge-media-queue-and-scan-log | 45 3 * * * | true |
| 91 | monitor-dlq-health | */30 * * * * | true |
| 94 | ops-ddl-weekly-summary | 0 8 * * 1 | true |
| 95 | catalog-sanity-weekly | 0 5 * * 1 | true |
| 96 | sync-instance-registry-status | 2-59/5 * * * * | true |
| 97 | alert-ghost-message-events | */5 * * * * | true |
| 99 | cleanup-cron-job-history | 0 3 * * * | true |
| 100 | analytics-log-retention | 20 5 * * * | true |
| 101 | qr-attempts-expire-15min | */15 * * * * | true |
| 102 | slow_query_monitor_hourly | 0 * * * * | true |
| 103 | pg_stat_statements_weekly_reset | 0 2 * * 0 | true |
| 104 | wpp2_disconnection_watchdog | */10 6-23 * * * | true |
| 105 | infra_check_hourly | 0 * * * * | true |
| 106 | run_all_checks_daily | 0 7 * * * | true |
| 107 | performance_report_weekly | 0 6 * * 1 | true |
| 108 | health_score_alert_hourly | 30 * * * * | true |
| 111 | regression_tests_daily | 0 8 * * * | true |
| 113 | bloat_alert_4h | 0 */4 * * * | true |
| 115 | redis_sentinel_refresh_5min | */5 * * * * | true |
| 116 | purge-webhook-rate-limits-2h | 0 * * * * | true |
| 117 | analyze_critical_tables | 30 3 * * * | true |
| 120 | wpp2-session-expiry-watchdog | */15 * * * * | true |
| 122 | wal-slot-monitor | */15 * * * * | true |
| 123 | weekly-edge-fn-freshness | 0 12 * * 1 | true |
| 124 | daily-wa-marketing-budget | 0 12 * * * | true |
| 126 | types-drift-weekly | 0 13 * * 1 | true |
| 127 | daily-backup-sentinel-check | 0 12 * * * | true |
| 128 | security_acl_email_check | */30 * * * * | true |
| 129 | cron-log-daily-purge | 30 2 * * * | true |
| 131 | guardian-heartbeat-sync | 2-59/5 * * * * | true |
| 133 | vacuum-alerts-daily | 6 2 * * * | true |
| 135 | vacuum-bootstrap-log-daily | 16 2 * * * | true |
| 136 | vacuum-connection-history-daily | 21 2 * * * | true |
| 137 | monthly-evo-audit | 0 6 1 * * | true |
| 138 | ensure-evolution-backcompat-views | 0 */6 * * * | true |
| 139 | cache-warmup-after-vacuum | 35 2 * * * | true |
| 142 | check-media-pipeline-health | */15 11-23 * * * | true |
| 143 | restore-integrity-check | 0 11 * * * | true |
| 144 | alert-consumer-halt | */5 * * * * | true |
| 146 | dlq-poison-guard | */5 * * * * | true |
| 147 | pino-timeout-monitor | */30 * * * * | true |
| 148 | refresh-health-score-cache | */5 * * * * | true |
| 149 | vps-performance-snapshot | 0 * * * * | true |
| 151 | security-invoker-daily-audit | 0 6 * * * | true |
| 152 | purge_webhook_events_processed | 30 4 * * * | true |
| 154 | v2-mirror-health-check | */15 * * * * | true |
| 156 | purge-ip-watch | 0 3 * * * | true |
| 158 | cleanup-guardian-events-evo-db | 2 4 * * * | true |
| 159 | evo-r2-path-scrubber | 0 4 * * * | true |
| 160 | evo-swarm-duplicate-detector | */5 * * * * | true |
| 161 | evo-401-glitchtip-feed | */10 * * * * | true |
| 162 | vps-matview-auto-refresh | */5 * * * * | true |
| 163 | evo-peak-hours-sla | */15 * * * * | true |
| 164 | evo-ack-loss-gap-detector | */5 * * * * | true |
| 165 | secdef-search-path-guard | */30 * * * * | true |
| 166 | evo-spurious-close-detector | */15 * * * * | true |
| 168 | evo-dedup-cap-monitor | */5 * * * * | true |
| 169 | vacuum-contacts-2h | 35 */2 * * * | true |
| 171 | evo-sync-messages-to-v2 | */5 * * * * | true |
| 172 | evo-instance-health-check | */10 * * * * | true |
| 173 | evo-detect-401-bursts | */15 * * * * | true |
| 176 | v2-pipeline-heartbeat | */30 * * * * | true |
| 179 | security-surface-sentinel | */30 * * * * | true |
| 180 | cron-guardian | */15 * * * * | true |
| 182 | evolution-pipeline-probe-15min | 2,17,32,47 * * * * | true |
| 183 | vacuum-burnin-tracker-daily | 12 2 * * * | true |
| 184 | vacuum-pipeline-health-log-daily | 7 2 * * * | true |
| 185 | vacuum-instance-credentials-daily | 9 2 * * * | true |
| 186 | vacuum-messages-2h | 25 */2 * * * | true |
| 187 | lid-contamination-daily | 0 8 * * * | true |
| 188 | check-guardian-alive | 3-59/10 * * * * | true |
| 189 | evo_cleanup_expired_contact_ids | 0 2 * * * | true |
| 190 | cleanup_expired_contact_ids | 0 3 * * * | true |
| 191 | auth-session-cleanup-weekly | 0 3 * * 0 | true |
| 192 | auth-session-overflow-alert | */30 * * * * | true |
| 193 | guardian-db-heartbeat-resilient | */5 * * * * | true |
| 194 | cleanup-guardian-heartbeat-public | 30 2 * * * | true |
| 197 | autofix-security-invoker | */30 * * * * | true |
| 203 | cookie-probe-2phase-30min | */30 * * * * | true |
| 204 | lux-maintenance-daily | 0 4 * * * | true |
| 205 | verify-alert-delivery-10min | */10 * * * * | true |
| 206 | monitor-ingestion-persistence-gap | */15 * * * * | true |
| 207 | purge-health-score-history | 0 5 * * * | true |
| 208 | purge-pipeline-health-log-60d | 20 2 * * * | true |
| 209 | purge-webhook-audit-log-90d | 45 3 * * * | true |
| 210 | purge-reconcile-jobs-7d | 10 2 * * * | true |
| 212 | purge-app-notifications-90d | 0 4 * * * | true |
| 213 | media_pipeline_health_check | 0 */4 * * * | true |
| 217 | expire-whatsapp-media-1h | 0 * * * * | true |
| 218 | logflare-cloudflare-cleanup | 0 3 * * * | true |
| 219 | logflare-deno-cleanup | 10 3 * * * | true |
| 220 | logflare-postgres-cleanup | 20 3 * * * | true |
| 221 | logflare-gotrue-cleanup | 30 3 * * * | true |
| 222 | logflare-realtime-cleanup | 35 3 * * * | true |
| 223 | logflare-storage-cleanup | 40 3 * * * | true |
| 224 | logflare-postgrest-cleanup | 45 3 * * * | true |
| 225 | wal-alert-state-cleanup | */15 * * * * | true |
| 230 | disk-actions-cleanup | 0 4 * * * | true |
| 231 | disk-tables-vacuum-weekly | 0 2 * * 0 | true |
| 233 | disk-daily-summary-refresh | 30 5 * * * | true |
| 234 | disk-baseline-snapshot-daily | 0 1 * * * | true |
| 235 | purge-webhook-logs | 15 3 * * * | true |
| 238 | disk-log-prune-daily | 0 3 * * * | true |
| 239 | disk-hires-prune-daily | 15 3 * * * | true |
| 240 | disk-baseline-prune-weekly | 30 3 * * 0 | true |
| 241 | disk-events-prune-weekly | 45 3 * * 0 | true |
| 242 | alert-retention-daily | 0 4 * * * | true |
| 243 | refresh_mv_daily_kpis | 0 * * * * | true |

**Análise:** 146 jobs confirmam a referência (~146). **Nenhum job inativo** (0 `active=false`). Observação: `189 evo_cleanup_expired_contact_ids` e `190 cleanup_expired_contact_ids` parecem duplicados funcionais (mesma finalidade em schemas diferentes) — candidatos a revisão, não bloqueante.

---

## Etapa 29 — Publicação Realtime (supabase_realtime)

**SQL:**
```sql
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY 1,2
```

**Resultado: 68 tabelas publicadas** — zapp 50, evo 12, email_app 5, financeiro 1:

| schemaname | tablename |
|---|---|
| email_app | email_accounts, email_messages, email_threads, email_tracking_events, imap_smtp_accounts |
| evo | evolution_alerts, evolution_contacts, evolution_conversations, evolution_label_associations, evolution_labels, evolution_messages, evolution_reactions, evolution_realtime_events, evolution_retry_metrics, evolution_sentiment_analysis, evolution_status_reactions, evolution_whatsapp_status |
| financeiro | payment_links |
| zapp | agent_presence, agent_stats, app_notifications, audio_meme_favorites, audio_memes, audit_logs, automation_executions, calls, channel_connections, connection_health_logs, contact_audit_log, conversation_sla, conversation_transfers, dispatch_error_logs, email_health_summary, email_revalidation_jobs, failed_messages, feature_flags, hmac_selftest_audit, message_reactions, notifications, outbound_message_queue, password_reset_requests, profiles, provider_message_log, qr_attempts, queue_goals, queue_members, queue_positions, queues, rate_limit_logs, sales_deals, security_alerts, security_audit_logs, sentiment_alerts, system_health_incidents, talkx_campaigns, talkx_recipients, team_conversation_members, team_conversations, team_message_reactions, team_messages, transfer_comments, user_roles, user_settings, voice_conversion_queue, warroom_alerts, whatsapp_connections, whisper_messages, workspace_settings |

**Análise:** 68 tabelas — cobertura razoável (321 tabelas em zapp → 50 publicadas ≈ 16%); conferir se faltam tabelas críticas (ex.: `messages`, `contacts` não estão na lista — provavelmente intencional por volume).

---

## Etapa 30 — Replication slots (WAL)

**SQL:**
```sql
SELECT slot_name, active, wal_status FROM pg_replication_slots
```

**Resultado (2 slots, ambos ATIVOS):**

| slot_name | active | wal_status |
|---|---|---|
| supabase_realtime_slot_realtime_ | true | reserved |
| supabase_realtime_messages_replication_slot_ | true | reserved |

**Análise:** ✅ Nenhum slot inativo/órfão neste banco. (Slots `cainophile_*` pertencem ao database `_supabase`/Logflare — fora do escopo desta query; job `wal-slot-monitor` cobre a vigilância.)

---

## Etapa 31 — Storage buckets

**SQL:**
```sql
SELECT id, name, public FROM storage.buckets ORDER BY 1
```

**Resultado (13 buckets):**

| id | name | public |
|---|---|---|
| audio-memes | audio-memes | **true** |
| audio-messages | audio-messages | false |
| avatars | avatars | **true** |
| comprovantes-financeiro | comprovantes-financeiro | false |
| custom-emojis | custom-emojis | **true** |
| email-attachments | email-attachments | false |
| etiquetas-remessa | etiquetas-remessa | false |
| fechamentos | fechamentos | false |
| quarantine | quarantine | false |
| recibos-entrega | recibos-entrega | **true** |
| stickers | stickers | **true** |
| team-chat-files | team-chat-files | false |
| whatsapp-media | whatsapp-media | false |

**Análise:** 13 buckets; 6 públicos (audio-memes, avatars, custom-emojis, recibos-entrega, stickers — conteúdo de mídia de exibição). `quarantine` (isolamento de mídia suspeita) e `whatsapp-media` privados — correto. Conferir RLS de buckets públicos na fase de segurança.

---

## Etapa 32 — Auth: users, identities e profiles

**SQL:**
```sql
SELECT count(*) AS users FROM auth.users
SELECT provider, count(*) FROM auth.identities GROUP BY 1 ORDER BY 2 DESC
SELECT count(*) AS profiles FROM zapp.profiles
```

**Resultado:**

| Métrica | Valor |
|---|---|
| auth.users | **19** |
| zapp.profiles | **19** |
| auth.identities (email) | 13 |
| auth.identities (google) | 1 |
| **Total identities** | **14** |

**Análise:**
- ✅ users (19) = profiles (19) — paridade auth↔profile correta.
- ⚠️ **GAP: 19 users × 14 identities → 5 usuários sem identity** (usuários criados sem identity registrada, ou identities deletadas). Investigar: usuários órfãos/desativados podem inflar o censo ou indicar limpeza pendente.
- Providers ativos: email (13) e google (1).

---

## Etapa 33 — Migrations (supabase_migrations.schema_migrations)

**SQL:**
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY 1
```

**Resultado: 92 migrations registradas** (última: `20260804140000` — `fix_rls_delta_corrigido`). Destaques:

| version | name |
|---|---|
| 20260716 | fix_dispatch_error_logs_grant (mais antiga) |
| … | (92 no total) |
| 20260804000000 | canonical_schema_squash_133_migrations |
| 20260804120000 | enable_rls_missing_tables (aplicada de facto; delta efetivo em 20260804140000) |
| 20260804130000 | fix_rls_critical_gaps (C-1 corrigido; delta efetivo em 20260804140000) |
| 20260804140000 | fix_rls_delta_corrigido (mais recente) |

**Análise:** ✅ Histórico íntegro; squash de 133 migrations em uma única canonical (`20260804000000`) presente. Últimas 3 (12/13/14h de 04/08) são correções de RLS com deltas aplicados de facto. Nenhuma pendência visível na tabela de migrations.

---

## Etapa 34 — GUCs de nível banco (app.% / pgrst.%)

**SQL:**
```sql
SELECT name, setting FROM pg_settings WHERE name LIKE 'app.%' OR name LIKE 'pgrst.%'
```

**Resultado: 0 linhas** — nenhum GUC `app.*` ou `pgrst.*` setado em `pg_settings` (esses parâmetros são configurados no PostgREST via config do container, não no banco). Sem impacto para RPCs; apenas registro.

---

## Etapa 35 (complemento) — Vault secrets

**SQL:**
```sql
SELECT count(*) AS secrets FROM vault.secrets
```

**Resultado: 30 secrets** no vault (pgsodium/supabase_vault). ✅ Tabela `vault.secrets` existe e está populada.

---

## Pendências / recomendações para as próximas fases

1. **Extensão `http` ausente** — verificar na auditoria de RPCs se qualquer função usa `http.*`; se sim, instalar `http` (ou migrar para `net.http_*` do pg_net).
2. **5 usuários sem identity** — auditar `auth.users` × `auth.identities` (usuários órfãos ou limpeza pendente).
3. **`anon` sem `zapp` no search_path** — conferir se RPCs de zapp chamadas como anon dependem de qualificação explícita.
4. **`public` com 511 views** — auditar origem/necessidade (provável camada backcompat).
5. **Jobs cron 189/190 duplicados funcionalmente** — revisar (não bloqueante).
6. **Schemas `graveyard`/`parity_audit`** — confirmar se ainda são necessários (artefatos de auditoria).
7. **Censo zapp (321/380/1066) CONFIRMADO** — baseline da reconciliação de RPCs pode usar estes números como referência.
