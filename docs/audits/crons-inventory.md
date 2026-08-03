# Inventário de Crons — E12 (F2-06, F2-07, F2-08, F2-09)

**Data da auditoria:** 03/08/2026
**Banco:** Supabase self-hosted `supabase.atomicabr.com.br` · DB `postgres` (pg_cron) + DB `_supabase` (jobs logflare)
**Método:** Consultas somente-leitura via MCP Supabase (`cron.job`, `cron.job_run_details`, `pg_stat_statements`, `pg_proc`, `pg_class`)
**Escopo:** Documentar o estado atual dos achados F2-06, F2-07, F2-08 e F2-09 (E12 — Crons)
**Regra respeitada:** ✅ Nenhum cron foi alterado, desativado ou criado. Auditoria e documentação apenas. Nenhum comando `git` foi executado.

---

## Resumo geral

- **148 jobs** em `cron.job` (DB `postgres`), **148 ativos** (100%).
- Destes, **7 jobs executam no database `_supabase`** (chain logflare — F2-08); os demais 141 executam em `postgres`.
- Todos os 21 jobs auditados (F2-06: 8, F2-07: 6, F2-08: 7) estão **ativos** e com **última execução bem-sucedida** (sem falhas nos últimos 7 dias).

---

## F2-06 — 4 pares de crons duplicados (8 jobs)

Confirmado ao vivo: os 4 pares continuam duplicados, todos ativos, todos executando como `postgres` no DB `postgres`.

### Par 1 — `cleanup_expired_contact_ids` (jobids 189 + 190)

| | Job 189 | Job 190 |
|---|---|---|
| jobname | `evo_cleanup_expired_contact_ids` | `cleanup_expired_contact_ids` |
| schedule | `0 2 * * *` (02:00) | `0 3 * * *` (03:00) |
| command | `SELECT evo.cleanup_expired_contact_ids()` | `SELECT zapp.cleanup_expired_contact_ids()` |
| active | ✅ | ✅ |

**Análise:** funções homônimas em schemas diferentes, **corpo idêntico** (`SECURITY DEFINER`, `SET search_path`):
- `evo.cleanup_expired_contact_ids()` → `DELETE FROM evo.contact_id_graveyard WHERE expiration_date < now()`
- `zapp.cleanup_expired_contact_ids()` → `DELETE FROM contact_id_graveyard ...` (resolve para `zapp.contact_id_graveyard`)

Ambas as tabelas `contact_id_graveyard` existem (`relkind='r'`) em `evo` **e** `zapp` — duplicação em dois níveis: tabelas duplicadas + jobs duplicados mantendo-as. Horários diferentes (02:00 vs 03:00) mas mesma operação.

### Par 2 — purge de eventos de webhook processados (jobids 54 + 152)

| | Job 54 | Job 152 |
|---|---|---|
| jobname | `purge-processed-webhook-events` | `purge_webhook_events_processed` |
| schedule | `30 3 * * *` (03:30) | `30 4 * * *` (04:30) |
| command | `SELECT zapp.fn_purge_processed_webhook_events(30, 5000)` | `DELETE FROM zapp.webhook_events_processed WHERE processed_at < NOW() - INTERVAL '3 days'` |
| active | ✅ | ✅ |

**Análise:** mesmo domínio lógico (purga de eventos de webhook processados), **retenções divergentes: 30 dias vs 3 dias**.
- Job 54: `zapp.fn_purge_processed_webhook_events(p_retention_days=30, p_batch_size=5000)` — loop sobre todas as partições `evo.evolution_webhook_events%` (`relkind='r'`; hoje 18: `evolution_webhook_events_v2` + 16 partições mensais 2026_03..2027_06 + `_default`), deleta `processed = true AND created_at < now() - 30d` em batches de 5.000.
- Job 152: DELETE direto em `zapp.webhook_events_processed` (tabela real, `relkind='r'`) com retenção de 3 dias.
- Alvos físicos distintos (partições `evo` vs tabela `zapp`), mas mesma finalidade com política de retenção inconsistente (30d vs 3d).
- **Evidência de execução (03/08):** job 152 deletou **58.889 linhas** (`DELETE 58889`); job 54 retornou `1 row` (jsonb).

### Par 3 — purge de `zapp.webhook_audit_log` (jobids 209 + 61)

| | Job 209 | Job 61 |
|---|---|---|
| jobname | `purge-webhook-audit-log-90d` | `purge_webhook_audit` |
| schedule | `45 3 * * *` (03:45) | `15 4 * * *` (04:15) |
| command | `DELETE FROM zapp.webhook_audit_log WHERE created_at < now() - interval '90 days'` | Bloco DO: `DELETE ... processed > 3 dias` + `rejected > 1 dia` + `duplicate > 3 dias` (todos em `zapp.webhook_audit_log`) |
| active | ✅ | ✅ |

**Análise:** **mesma tabela-alvo** (`zapp.webhook_audit_log`, `relkind='r'`) com duas políticas de retenção sobrepostas. O job 61 (DO block, purgas escalonadas 3d/1d/3d) é o mecanismo principal; o job 209 é a rede de segurança de 90 dias. Dois jobs mantendo a mesma tabela.

### Par 4 — purge de `cron.job_run_details` (jobids 99 + 216)

| | Job 99 | Job 216 |
|---|---|---|
| jobname | `cleanup-cron-job-history` | `cleanup-cron-job-logs` |
| schedule | `0 3 * * *` (03:00) | `0 4 * * *` (04:00) |
| command | `DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '3 days' AND start_time IS NOT NULL;` | `DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days'` |
| active | ✅ | ✅ |

**Análise:** **duplicata quase literal** — mesmo alvo (`cron.job_run_details`), mesma retenção (3 dias). Única diferença: o job 99 tem o guard `AND start_time IS NOT NULL`; o job 216 **não** tem (é um superset do 99 — deleta também linhas com `start_time NULL`). O job 216 torna o 99 redundante.

### Tabela-resumo F2-06

| Par | JobIDs | Jobnames | Horários | Alvo | Retenção |
|---|---|---|---|---|---|
| 1 | 189 + 190 | `evo_cleanup_expired_contact_ids` + `cleanup_expired_contact_ids` | 02:00 + 03:00 | `contact_id_graveyard` (evo **e** zapp) | n/a (expiração) |
| 2 | 54 + 152 | `purge-processed-webhook-events` + `purge_webhook_events_processed` | 03:30 + 04:30 | eventos webhook processados (evo partições + zapp) | **30d vs 3d** |
| 3 | 209 + 61 | `purge-webhook-audit-log-90d` + `purge_webhook_audit` | 03:45 + 04:15 | `zapp.webhook_audit_log` | 90d vs 3d/1d/3d |
| 4 | 99 + 216 | `cleanup-cron-job-history` + `cleanup-cron-job-logs` | 03:00 + 04:00 | `cron.job_run_details` | 3d vs 3d (216 ⊇ 99) |

---

## F2-07 — 6 VACUUMs concorrentes na janela 02:06–02:21

Confirmado ao vivo: **exatamente 6** jobs `VACUUM ANALYZE` em tabelas `evo.*` agendados entre 02:06 e 02:21 (janela de 15 minutos), todos ativos.

| JobID | Jobname | Schedule | Horário | Comando |
|---|---|---|---|---|
| 133 | `vacuum-alerts-daily` | `6 2 * * *` | 02:06 | `VACUUM ANALYZE evo.evolution_alerts` |
| 184 | `vacuum-pipeline-health-log-daily` | `7 2 * * *` | 02:07 | `VACUUM ANALYZE evo.evolution_pipeline_health_log` |
| 185 | `vacuum-instance-credentials-daily` | `9 2 * * *` | 02:09 | `VACUUM ANALYZE evo.evolution_instance_credentials` |
| 183 | `vacuum-burnin-tracker-daily` | `12 2 * * *` | 02:12 | `VACUUM ANALYZE evo.evolution_burnin_tracker` |
| 135 | `vacuum-bootstrap-log-daily` | `16 2 * * *` | 02:16 | `VACUUM ANALYZE evo.evolution_bootstrap_log` |
| 136 | `vacuum-connection-history-daily` | `21 2 * * *` | 02:21 | `VACUUM ANALYZE evo.evolution_connection_history` |

**Contexto (outros jobs de manutenção de bloat, fora da janela crítica):**

| JobID | Jobname | Schedule | Comando |
|---|---|---|---|
| 231 | `disk-tables-vacuum-weekly` | `0 2 * * 0` (dom 02:00) | `VACUUM ANALYZE ops.disk_actions_queue, ops.paused_services, ops.alert_cooldown, ops.docker_prune_log, ops.disk_orphans` |
| 186 | `vacuum-messages-2h` | `25 */2 * * *` | `VACUUM ANALYZE evo.evolution_messages` (a cada 2h) |
| 169 | `vacuum-contacts-2h` | `35 */2 * * *` | `VACUUM ANALYZE evo.evolution_contacts` (a cada 2h) |
| 117 | `analyze_critical_tables` | `30 3 * * *` | `SELECT zapp.fn_force_autovacuum(...)` top-10 por dead tuples |
| 139 | `cache-warmup-after-vacuum` | `35 2 * * *` | `SELECT evo.fn_cache_warmup_after_vacuum()` (logo após a janela) |

**Evidência de execução (02/08 e 03/08):** os 6 VACUUMs rodaram com sucesso, todos com duração < 100 ms (tabelas pequenas) — o risco do achado é de **concorrência/overlap futuro** (6 `VACUUM ANALYZE` simultâneos na mesma janela de 15 min + warmup às 02:35), não de falha atual.

---

## F2-08 — Cadeia logflare: 7 jobs de cleanup (03:00–03:45)

Confirmado ao vivo: **exatamente 7** jobs `logflare-*-cleanup`, todos ativos, todos executando **no database `_supabase`** (coluna `cron.job.database = '_supabase'`; as tabelas `_analytics.log_events_*` **não existem** no DB `postgres` — `to_regclass` retorna NULL). Todos com retenção de **30 dias** e mesmo padrão: `DELETE FROM _analytics.log_events_<source_id> WHERE timestamp < NOW() - INTERVAL '30 days'`.

| JobID | Jobname (fonte logflare) | Schedule | Horário | Tabela `_analytics.log_events_<uuid>` |
|---|---|---|---|---|
| 218 | `logflare-cloudflare-cleanup` | `0 3 * * *` | 03:00 | `log_events_d8f3db66_f2bb_4b55_91dd_634ae4d84584` |
| 219 | `logflare-deno-cleanup` | `10 3 * * *` | 03:10 | `log_events_5d6439e4_9b4f_40fe_8753_17bb211a9d14` |
| 220 | `logflare-postgres-cleanup` | `20 3 * * *` | 03:20 | `log_events_edd3e1f2_0227_4290_8dcb_fec346718d0c` |
| 221 | `logflare-gotrue-cleanup` | `30 3 * * *` | 03:30 | `log_events_e82ccb30_09fc_40ab_9351_8830f979ba02` |
| 222 | `logflare-realtime-cleanup` | `35 3 * * *` | 03:35 | `log_events_f710bf28_9f9e_4d37_8036_583441d5c20c` |
| 223 | `logflare-storage-cleanup` | `40 3 * * *` | 03:40 | `log_events_9a257a1e_899c_4cc2_bf44_c70ea983ffef` |
| 224 | `logflare-postgrest-cleanup` | `45 3 * * *` | 03:45 | `log_events_16ca3cb0_6946_4f74_854a_92ac6564e20f` |

**Mapa da cadeia:** 1 job por componente Supabase cujo log é ingerido pelo Logflare: `cloudflare` → `deno` (edge runtime) → `postgres` → `gotrue` (auth) → `realtime` → `storage` → `postgrest`. Os 7 jobs são **idênticos em forma**, variando apenas o UUID da tabela-fonte e o horário (escalonados em 5–10 min para não competirem entre si).

**Evidência de execução:** todos os 7 rodaram com sucesso em 01/08, 02/08 e 03/08 (`DELETE 0` — sem dados além da retenção). O achado F2-08 sugere reagrupar a cadeia em um job único parametrizado (7 tabelas num loop), eliminando 6 agendamentos.

---

## F2-09 — Performance: `ops.fn_regression_tests()` = 8,8 s por chamada

### Cron que consome a função

| JobID | Jobname | Schedule | Comando |
|---|---|---|---|
| 111 | `regression_tests_daily` | `0 8 * * *` (08:00 — horário comercial) | `SELECT test_name, status FROM ops.fn_regression_tests() WHERE status != 'PASS'` |

### Evidência `pg_stat_statements` (janela desde reset em 2026-07-31 18:36)

**10 shapes de query** chamando `ops.fn_regression_tests()`, **32 chamadas**, **~290,2 s de tempo acumulado** de execução.

| Shape (resumo) | Calls | Média (ms) | Min (ms) | Max (ms) | Total (ms) |
|---|---|---|---|---|---|
| `SELECT test_name, status, detail ... ORDER BY status DESC, test_name` | 8 | **8.803,58** | 8.555,54 | 9.440,55 | 70.428,64 |
| `count(*) FILTER(...) pass/fail/total` | 8 | 8.757,70 | 8.443,73 | 9.033,18 | 70.061,62 |
| `SELECT test_name, status, detail ... ORDER BY test_name` | 3 | 8.681,22 | 8.484,99 | 8.932,66 | 26.043,65 |
| `count(*) FILTER(...) pass/fail` (2 shapes) | 5 | 8.637–8.907 | 8.471,38 | 9.269,09 | 43.724,40 |
| **`WHERE status != $1` (shape do cron 111)** | 2 | **9.338,95** | 9.309,41 | 9.368,50 | 18.677,91 |
| outras 3 shapes (NOW()/range/UNION ALL) | 5 | 8.672–9.156 | 8.633,74 | **17.076,27** | 43.529,82 |

**Conclusão:** o achado F2-09 está **confirmado e medido** — média de **8.803,58 ms** na shape dominante (8,8 s), pior caso observado de **17,08 s** (shape com UNION ALL), e a shape exata do cron 111 (`WHERE status != 'PASS'`) tem média de **9.339 ms**. Desde o reset, a função consumiu **~290 s (≈4,8 min) de CPU/banco em 32 chamadas**, sendo 2 delas do cron diário das 08:00 (horário de pico do CRM).

**Direção sugerida (já descrita no plano F2-09):** mover `regression_tests_daily` para off-peak e/ou materializar o resultado da bateria de regressão em MV/`health_score` cacheado (objetivo: 8,8 s/call → ~0 s).

---

## Estado de execução dos 21 jobs auditados (últimos 7 dias)

- **Zero falhas** nos 21 jobs (8 do F2-06, 6 do F2-07, 7 do F2-08) nos últimos 7 dias.
- Últimas execuções (03/08): F2-06 todos `succeeded` (destaque: job 152 `DELETE 58889`, job 99 `DELETE 5`); F2-07 os 6 `VACUUM` `succeeded`; F2-08 os 7 `DELETE 0` `succeeded`.

---

## Notas metodológicas

- Fonte da verdade: `cron.job` (jobid, jobname, schedule, command, database, username, active) + `cron.job_run_details` + `pg_stat_statements` + `pg_get_functiondef`.
- Os jobs logflare (218–224) rodam no DB `_supabase` — **não devem ser alterados** do DB `postgres`; qualquer correção de F2-08 precisa considerar o database alvo.
- Diferença observada: o job 190 (`cleanup_expired_contact_ids`) registrou execução em 02/08 às 02:00 e em 03/08 às 03:00 — indício de que o schedule foi alterado recentemente (02:00 → 03:00); o job 189 continua às 02:00.
- Nenhum dado foi modificado; todas as queries foram `SELECT`.
