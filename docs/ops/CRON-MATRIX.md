# CRON-MATRIX — Espelhos arquivo × DB (pg_cron)

> Gerado em 2026-08-07 · Branch `fix/fin-a7-cronmatrix-f9160` · Worktree `fin-a7-cronmatrix-f9160`
> Escopo: verificação final dos espelhos de cron jobs corrigidos na onda anterior (ON CONFLICT×11 + item85) + inventário completo de migrations com `cron.schedule`.
> Fonte DB: evidência real `cron.job` (2026-08-07) fornecida pelo orquestrador (12 jobs). DB é a fonte da verdade; **nenhuma correção foi aplicada** — divergências reportadas para decisão do orquestrador.
> Método: extração tokenizada (strings/dollar-quotes/comentários) de `SELECT/PERFORM cron.schedule(...)` em `supabase/migrations/` (script `scripts/extract_cron_schedules.py`).

## Resumo executivo

| Métrica | Valor |
|---|---|
| Migrations com `cron.schedule` | 20 arquivos |
| Statements `cron.schedule` (SELECT + PERFORM) | 41 (30 SELECT + 11 PERFORM) |
| Jobs citados do DB verificados | 12 |
| Status OK (schedule arquivo = schedule DB) | **11/12** |
| Divergências | **1** (D-1: `evo-wpp2-401-disconnect-feed` — schedule OK, nome+command sem espelho no HEAD) |
| Jobs 100% órfãos (DB citado sem migration) | **0** |
| `ON CONFLICT (jobname)` inválido restante | **0** (as 6 menções são comentários de NOTA) |

---

## 1. Matriz de verificação — 12 jobs do DB citados (foco da onda)

Legenda status: **OK** = schedule do arquivo idêntico ao DB; **DIVERGÊNCIA** = espelho incompleto/inconsistente (não corrigido).

| # | jobname (DB) | schedule (DB) | Migration espelho | Linha | schedule (arquivo) | command (arquivo) | Status |
|---|---|---|---|---|---|---|---|
| 1 | vacuum-bootstrap-log-daily | `16 2 * * *` | `20260806995001_autovacuum_bootstrap_log.sql` | 53 | `16 2 * * *` | `VACUUM ANALYZE evo.evolution_bootstrap_log` | ✅ OK |
| 2 | disk-actions-cleanup | `9 4 * * *` | `20260806995003_autovacuum_disk_actions_queue.sql` | 56 | `9 4 * * *` | `DELETE FROM ops.disk_actions_queue WHERE executed_at < now() - interval '7 days'` | ✅ OK |
| 3 | disk-baseline-prune-weekly | `30 3 * * 0` | `20260804000000_canonical_schema_squash_133_migrations.sql` + `20260807093000_item89_disk_baseline_collector_guard.sql` | 11227 / 74 | `30 3 * * 0` (ambos) | `SELECT ops.prune_disk_baseline()` (ambos) | ✅ OK |
| 4 | disk-baseline-snapshot-daily | `0 1 * * *` | `20260807094000_item143_restore_partition_baseline_dynamic.sql` | 26 | `0 1 * * *` | DO block: snapshot `pg_total_relation_size` por schema (evo/zapp/ops) → INSERT `ops.disk_baseline` | ✅ OK |
| 5 | disk-tables-vacuum-weekly | `0 2 * * 0` | `20260806995007_autovacuum_docker_prune_log.sql` | 45 | `0 2 * * 0` | `VACUUM ANALYZE ops.disk_actions_queue, ops.paused_services, ops.alert_cooldown, ops.docker_prune_log, ops.disk_orphans` | ✅ OK |
| 6 | logflare-cloudflare-cleanup | `9 3 * * *` | `20260807095000_item90_logflare_retention_7d.sql` | 26 | `9 3 * * *` | DO block: DELETE `_analytics.cloudflare_logs`/`edge_logs` 7d; demais 30d (EXCEPTION undefined_table) | ✅ OK |
| 7 | host-disk-collector-guard | `7,22,37,52 * * * *` | `20260807093000_item89_disk_baseline_collector_guard.sql` | 64 | `7,22,37,52 * * * *` | `SELECT ops.fn_host_disk_collector_guard()` | ✅ OK |
| 8 | evo-instance-health-check | `3-59/15 * * * *` | `20260807091100_item85_evo401_feed_conn_history.sql` | 31 | `3-59/15 * * * *` | `SELECT evo.fn_update_instance_health()` | ✅ OK |
| 9 | evo-default-partition-guard | `*/30 * * * *` | `20260807091100_item85_evo401_feed_conn_history.sql` | 46 | `*/30 * * * *` | DO block (`$g$`/`$i$`): conta eventos na partição default 1h → INSERT `zapp.warroom_alerts` (ON CONFLICT DO NOTHING legítimo) | ✅ OK |
| 10 | **evo-wpp2-401-disconnect-feed** | `7,17,27,37,47,57 * * * *` | schedule: `20260806990000_rb2_desfasar_evo_401_feed.sql` — **sob o nome antigo `evo-401-feed`**; rename+command: **sem espelho no HEAD** | 10 | `7,17,27,37,47,57 * * * *` (sob `evo-401-feed`) | INSERT `zapp.webhook_health_alerts` (sentry_401_feed, `fn_get_401_payload`) — **command do DB é outro** (`SELECT evo.fn_feed_401_disconnect_alerts()`) | ⚠️ **DIVERGÊNCIA (D-1)** |
| 11 | evo-wpp2-uptime-kpi | `6,21,36,51 * * * *` | `20260807110000_ag_ex19_watchdogs_kpi.sql` (+ fn em `20260807110002`) | 46 | `6,21,36,51 * * * *` | `SELECT evo.fn_wpp2_uptime_kpi()` | ✅ OK |
| 12 | kpi-alerts-auto-resolve | `55 * * * *` | `20260807110003_ag_ex19_kpi_resolved_generated_fix.sql` | 58 | `55 * * * *` | `SELECT zapp.fn_resolve_kpi_alerts_stale()` | ✅ OK |

---

## 2. Divergência D-1 — `evo-wpp2-401-disconnect-feed` (job 161): schedule OK, nome+command sem espelho

**Fato (DB, 07/08):** job `evo-wpp2-401-disconnect-feed` existe com schedule `7,17,27,37,47,57 * * * *` (o desfase da onda anterior chegou ao DB).

**Fato (repo, HEAD 033ac95e4):** o jobname `evo-wpp2-401-disconnect-feed` **não ocorre em nenhuma migration** (`grep -rn` em `supabase/migrations/` = 0 hits). O comando `SELECT evo.fn_feed_401_disconnect_alerts()` também não aparece em nenhum `cron.schedule`/`UPDATE cron.job` do repo (a função só é citada em REVOKE/GRANT em `20260807120000_revoke_anon_execute_six_functions.sql:29-31` — criação da função sem espelho, DDL manual).

**Cadeia de evidência (git):**
1. `20260806190500_rb2_glitchtip_cleanup.sql:9-21` — rename `evo-401-glitchtip-feed` → `evo-401-feed` + replaces de command (glitchtip→sentry). ✅ espelhado.
2. `20260806990000_rb2_desfasar_evo_401_feed.sql:10-12` — `cron.schedule('evo-401-feed', '7,17,27,37,47,57', ...)` (desfase; upsert por jobname no job 161). ✅ schedule espelhado (nome antigo).
3. Migration `20260807110001_ag_ex19_v2_cron_and_inventory.sql` **original** (commit `5b083e59f`, linhas 101-109) continha:
   ```sql
   UPDATE cron.job SET jobname='evo-wpp2-401-disconnect-feed', command='SELECT evo.fn_feed_401_disconnect_alerts()' WHERE jobid=161;
   UPDATE cron.job SET jobname='evo-wpp2-uptime-kpi', command='SELECT evo.fn_wpp2_uptime_kpi()' WHERE jobid=163;
   UPDATE cron.job SET active=false WHERE jobid IN (104, 120);
   ```
   → aplicada no DB (o DB reflete o rename).
4. A versão **versionada no HEAD** (commit `612b67126`, "chore(db): versiona 23 migrations DB-only") **reescreveu o arquivo sem os UPDATEs** (135→95 linhas; header virou "Popular cron_inventory com todos os jobs ativos (v2)"; restou só o upsert de `zapp.cron_inventory`). O rename/command do 161 ficou **sem espelho**.

**Impacto em rebuild do zero:** a sequência recriaria `evo-401-feed` (command antigo, INSERT sentry_401_feed via `fn_get_401_payload`) — sem entrega via `evolution_alerts` e com nome divergente do DB.

**Ação sugerida (orquestrador decide — NÃO aplicado):**
- Opção A: restaurar os UPDATEs no espelho `20260807110001` (fiel ao efeito aplicado no DB); ou
- Opção B: migration complementar no padrão da casa (`cron.unschedule('evo-wpp2-401-disconnect-feed') WHERE EXISTS...` + `cron.schedule('evo-wpp2-401-disconnect-feed', '7,17,27,37,47,57 * * * *', 'SELECT evo.fn_feed_401_disconnect_alerts()')`) + espelho de criação da função `evo.fn_feed_401_disconnect_alerts`.

---

## 3. Inventário completo — 41 statements `cron.schedule` em 20 migrations

### 3.1 Baseline consolidado — `20260804000000_canonical_schema_squash_133_migrations.sql` (15)

| Linha | jobname | schedule | command (resumo) |
|---|---|---|---|
| 74 | sicoob-outbox-drain | `* * * * *` | http_post → `/functions/v1/sicoob-outbox-consumer` |
| 93 | cleanup-storage-orphans-daily | `0 3 * * *` | http_post → `/functions/v1/cleanup-storage-orphans` |
| 115 | connection-health-check-every-5min | `*/5 * * * *` | http_post → `/functions/v1/connection-health-check` |
| 137 | nps-scheduler-daily | `0 14 * * *` | http_post → `/functions/v1/nps-scheduler` |
| 159 | provider-healthcheck-every-2min | `*/2 * * * *` | http_post → `/functions/v1/provider-healthcheck` |
| 181 | queue-rebalance-every-5min | `*/5 * * * *` | http_post → `/functions/v1/queue-rebalance` |
| 203 | reprocess-failed-messages-15m | `*/15 * * * *` | http_post → `/functions/v1/reprocess-failed-messages` |
| 225 | talkx-scheduler-check | `* * * * *` | http_post → `/functions/v1/talkx-scheduler` |
| 247 | warroom-alert-resolver-1min | `* * * * *` | http_post → `/functions/v1/auto-escalate-sla` (body resolve) |
| 10759 | purge-webhook-logs | `15 3 * * *` | `SELECT zapp.purge_webhook_logs()` |
| 11223 | disk-log-prune-daily | `0 3 * * *` | `DELETE FROM ops.host_disk_log WHERE checked_at < now() - interval '30 days'` |
| 11225 | disk-hires-prune-daily | `15 3 * * *` | `SELECT ops.prune_disk_hires()` |
| 11227 | disk-baseline-prune-weekly | `30 3 * * 0` | `SELECT ops.prune_disk_baseline()` |
| 11229 | disk-events-prune-weekly | `45 3 * * 0` | `DELETE FROM ops.disk_event_log WHERE ts < now() - interval '90 days'` |
| 14706 | alert-retention-daily | `0 4 * * *` | `DELETE FROM evo.evolution_alerts WHERE resolved = true AND created_at < NOW() - INTERVAL '...'` |

### 3.2 Migrations avulsas (26)

| Arquivo | Linha | jobname | schedule | command (resumo) |
|---|---|---|---|---|
| `20260805000008_campanhas_nps_cron.sql` (PERFORM) | 16 | nps-daily-trigger | `0 10 * * *` | http_post → `/functions/v1/nps-scheduler` |
| `20260806125500_db05b_ops_reference_integrity_guardrail.sql` (PERFORM) | 105 | reference-integrity-daily | `0 8 * * *` | `SELECT ops.fn_check_reference_integrity()` |
| `20260806140000_f2_34_retention_webhook_logs.sql` | 80 | zapp-purge-webhook-logs-90d | `0 5 * * 1` | `SELECT zapp.fn_purge_webhook_logs(interval '90 days')` |
| `20260806171000_rb2_d1_backups_schema_expiry.sql` | 74 | expire-stale-backups | `0 4 * * *` | `SELECT ops.fn_expire_stale_backups(90)` |
| `20260806171500_rb2_c10_retention_jobs.sql` | 21 | purge-webhook-audit-log-90d | `46 3 * * *` | `DELETE FROM zapp.webhook_audit_log ... interval '30 days'` |
| `20260806171500_rb2_c10_retention_jobs.sql` | 22 | purge_webhook_events_processed | `30 4 * * *` | `DELETE FROM zapp.webhook_events_processed ... interval '30 days'` |
| `20260806171500_rb2_c10_retention_jobs.sql` | 23 | purge-ddl-audit-90d | `12 4 * * *` | `DELETE FROM ops.ddl_audit WHERE "at" < now() - interval '90 days'` |
| `20260806173500_rb2_a4c_stagger_verify_alert_delivery_cron.sql` | 23 | verify-alert-delivery-10min | `4,14,24,34,44,54 * * * *` | `SELECT ops.fn_verify_alert_delivery()` |
| `20260806191000_bugfix_retention_naming_and_stale_expiry.sql` | 48 | purge-webhook-audit-log-30d | `46 3 * * *` | `DELETE FROM zapp.webhook_audit_log ... interval '30 days'` |
| `20260806990000_rb2_desfasar_evo_401_feed.sql` | 10 | evo-401-feed (→ D-1) | `7,17,27,37,47,57 * * * *` | INSERT webhook_health_alerts sentry_401_feed (`fn_get_401_payload`) |
| `20260806995001_autovacuum_bootstrap_log.sql` | 53 | vacuum-bootstrap-log-daily | `16 2 * * *` | `VACUUM ANALYZE evo.evolution_bootstrap_log` |
| `20260806995003_autovacuum_disk_actions_queue.sql` | 56 | disk-actions-cleanup | `9 4 * * *` | `DELETE FROM ops.disk_actions_queue ... interval '7 days'` |
| `20260806995007_autovacuum_docker_prune_log.sql` | 45 | disk-tables-vacuum-weekly | `0 2 * * 0` | `VACUUM ANALYZE ops.disk_actions_queue, ops.paused_services, ops.alert_cooldown, ops.docker_prune_log, ops.disk_orphans` |
| `20260807090000_item86_health_score_ttl30.sql` | 91 | refresh-health-score-cache | `19,49 * * * *` | `SELECT zapp.fn_system_health_score_cached(5, TRUE)` |
| `20260807090000_item86_health_score_ttl30.sql` | 101 | purge-health-score-history | `0 5 * * *` | `DELETE FROM zapp.fn_health_score_history ... interval '7 days'` |
| `20260807090000_item86_health_score_ttl30.sql` | 111 | system-health-score | `5 * * * *` | `SELECT zapp.fn_system_health_score_cached(30, TRUE)` |
| `20260807090000_item86_health_score_ttl30.sql` | 121 | health_score_alert_hourly | `45 * * * *` | `SELECT zapp.fn_alert_health_score_degraded(70)` |
| `20260807091100_item85_evo401_feed_conn_history.sql` | 31 | evo-instance-health-check | `3-59/15 * * * *` | `SELECT evo.fn_update_instance_health()` |
| `20260807091100_item85_evo401_feed_conn_history.sql` | 46 | evo-default-partition-guard | `*/30 * * * *` | DO block: partição default 1h → warroom_alerts |
| `20260807092000_item84_warroom_critical_mirror.sql` | 77 | mirror-warroom-criticals | `5,20,35,50 * * * *` | `SELECT ops.fn_mirror_warroom_criticals()` |
| `20260807093000_item89_disk_baseline_collector_guard.sql` | 64 | host-disk-collector-guard | `7,22,37,52 * * * *` | `SELECT ops.fn_host_disk_collector_guard()` |
| `20260807093000_item89_disk_baseline_collector_guard.sql` | 74 | disk-baseline-prune-weekly | `30 3 * * 0` | `SELECT ops.prune_disk_baseline()` |
| `20260807094000_item143_restore_partition_baseline_dynamic.sql` | 26 | disk-baseline-snapshot-daily | `0 1 * * *` | DO block: snapshot tamanhos → `ops.disk_baseline` |
| `20260807095000_item90_logflare_retention_7d.sql` | 26 | logflare-cloudflare-cleanup | `9 3 * * *` | DO block: retenção 7d/30d `_analytics.*` |
| `20260807110000_ag_ex19_watchdogs_kpi.sql` | 46 | evo-wpp2-uptime-kpi | `6,21,36,51 * * * *` | `SELECT evo.fn_wpp2_uptime_kpi()` |
| `20260807110003_ag_ex19_kpi_resolved_generated_fix.sql` | 58 | kpi-alerts-auto-resolve | `55 * * * *` | `SELECT zapp.fn_resolve_kpi_alerts_stale()` |

> Observação: `disk-baseline-prune-weekly`, `evo-wpp2-uptime-kpi`, `evo-wpp2-401-disconnect-feed` e `evo-401-feed` têm espelhos em mais de um arquivo (squash baseline + migration de onda) — reaplicação idempotente pelo padrão unschedule+schedule; sem duplicação no DB.

---

## 4. Espelhos de cron via `UPDATE cron.job` (fora de `cron.schedule`)

| Arquivo | Linha | Efeito |
|---|---|---|
| `20260804000000_canonical_schema_squash_133_migrations.sql` | 8713 | `UPDATE cron.job SET active=true WHERE jobid=100 AND jobname='analytics-log-retention'` (reativação) |
| `20260806190500_rb2_glitchtip_cleanup.sql` | 9-21 | rename `evo-401-glitchtip-feed` → `evo-401-feed` + replaces de command (glitchtip→sentry, fn_get_401_glitchtip_payload→fn_get_401_payload) |
| `20260805000010_cron_scheduler_admin_rpcs.sql` | 61 | função utilitária (RPC) que faz `UPDATE cron.job` (não é execução direta) |
| `20260806121000_db02_purge_api_key_logs.sql` / `20260806121500_...` | 60 / 64 | `UPDATE cron.job_run_details` (histórico de runs — não é job) |
| ⚠️ `20260807110001_ag_ex19_v2_cron_and_inventory.sql` (HEAD) | — | **espelho reescrito sem os UPDATEs** de rename 161/163 e desativação 104/120 (ver D-1). No HEAD resta apenas o upsert de `zapp.cron_inventory` (linhas 40-95). |

---

## 5. Órfãos (jobs do DB citado sem migration correspondente)

- **Nenhum job 100% órfão** entre os 12 citados.
- **1 divergência parcial:** `evo-wpp2-401-disconnect-feed` — schedule espelhado (20260806990000, nome antigo), rename+command sem espelho no HEAD (D-1, seção 2).

---

## 6. Verificação de sintaxe das migrations corrigidas

- `grep -rn "ON CONFLICT (jobname)" supabase/migrations/` → **0**.
- Statements `cron.schedule(...) ON CONFLICT` inválidos → **0** (as 6 menções restantes são comentários de NOTA nas linhas 20/18/15/14/17/16 dos arquivos item86/item85/item84/item89/item143/item90, documentando a correção da onda anterior).
- Padrão da casa confirmado nos 11 arquivos corrigidos: `SELECT cron.unschedule('<jobname>') WHERE EXISTS (...)` + `SELECT cron.schedule(...)`; dollar-quotes com tags distintas (`$g$`/`$i$`) onde há DO block aninhado (item85, item90).

---

## 7. Notas de método

- Extração via `scripts/extract_cron_schedules.py` (tokenizador SQL com strings `'...'`, dollar-quotes `$tag$...$tag$`, comentários `--`/`/* */`; balanceamento de parênteses; suporta `SELECT` e `PERFORM`).
- Contagens `grep -c "cron.schedule"` por arquivo foram cruzadas com a extração; toda ocorrência residual é comentário (verificado linha a linha).
- Jobs da evidência DB fora dos 12 citados (ex.: jobs do squash, `verify-alert-delivery-10min`, `expire-stale-backups`, edge http_post jobs) NÃO foram verificados contra o DB nesta tarefa (evidência não fornecida) — listados no inventário da seção 3 para referência.
- Nenhum UPDATE no banco foi executado; nenhuma migration foi editada.
