# 🏥 Health Check — Banco Self-Hosted Supabase (PostgreSQL 15.8)
**Data:** 30/07/2026 | **Uptime:** 2 dias 02:36h | **Timezone:** America/Sao_Paulo

---

## 1. 📊 Visão Geral

| Métrica | Valor |
|---|---|
| **Versão PostgreSQL** | 15.8 (x86_64, GCC 13.2.0) |
| **Tamanho total do banco** | 1.592 MB (~1.56 GB) |
| **Usuários Auth** | 18 |
| **Total de tabelas** | 780 |
| **Total de linhas** | ~975.725 |
| **Cache hit ratio** | **99.83%** ✅ Excelente |
| **Extensões instaladas** | 21 (pg_stat_statements, pg_cron, pgmq, vector, pg_graphql, hypopg, etc.) |

### Schemas ativos (com dados)

| Schema | Tabelas | Views | Funções | Tamanho aprox. |
|---|---|---|---|---|
| **zapp** | 321 | 406 | 998 | **264 MB** |
| **evo** | 189 | 16 | 68 | **181 MB** |
| **bpm** | 41 | 0 | 0 | — |
| **email_app** | 33 | 0 | 0 | — |
| **ai** | 31 | 0 | 0 | — |
| **ops** | 20 | 4 | 47 | **20 MB** |
| **financeiro** | 16 | 11 | 44 | **11 MB** |
| **vendas** | 14 | 5 | 21 | — |
| **public** | 1 | 539 | 134 | **88 kB** |
| **storage** | 10 | 0 | 18 | — |
| **auth** | 24 | 0 | 4 | — |

> ℹ️ Schema `zapp` domina com 998 funções e 406 views — base de negócio principal.
> ℹ️ Schema `public` tem 539 views (99% são views geradas pelo sistema).

---

## 2. 🔌 Conexões

| Tipo | Quantidade |
|---|---|
| **Total** | **38** |
| Ativas | 2-7 |
| Idle | 29-34 |
| Idle in transaction | 0 ✅ |

> ✅ Sem conexões ociosas em transação — saudável.
> ⚠️ 38 conexões totais num banco self-hosted. Verificar limite (`max_connections`) no pg_settings se houver crescimento.

---

## 3. 💾 Uso de Disco por Schema

### zapp (264 MB) — maior schema
| Tabela | Tamanho | Dados | Índices | % Índice |
|---|---|---|---|---|
| `webhook_events_processed` | **111 MB** | 40 MB | 71 MB | 63.7% |
| `webhook_audit_log` | **93 MB** | 38 MB | 56 MB | 59.5% |
| `app_notifications` | 9.2 MB | 5.9 MB | 3.2 MB | 35% |
| `empresas` | 7.2 MB | 5.9 MB | 1.1 MB | 16.1% |
| `contact_intelligence` | 5.9 MB | 3.2 MB | 2.7 MB | 45% |
| Demais (~15 tabelas) | ~38 MB | | | |
| **Total schema** | **264 MB** | **110 MB** | **148 MB** | |

### evo (181 MB) — WhatsApp/Evolution API
| Tabela | Tamanho | Dados | Índices | % Índice |
|---|---|---|---|---|
| `evolution_messages_wpp2` | **66 MB** | 19 MB | 30 MB | 46% |
| `evolution_contacts` | **32 MB** | 11 MB | 21 MB | 65.6% |
| `evolution_webhook_events_v2_2026_07` | **23 MB** | 17 MB | 5.8 MB | 24.6% |
| `evolution_media` | 13 MB | 11 MB | 1.3 MB | 10.3% |
| `evolution_whatsapp_status` | 9.1 MB | 7.7 MB | 1.3 MB | 14.7% |
| `evolution_conversations_wpp2` | 7.4 MB | 3.8 MB | 3.6 MB | 48.4% |
| Demais (~183 tabelas) | ~30 MB | | | |
| **Total schema** | **181 MB** | **84 MB** | **76 MB** | |

### ops (20 MB) — operações/auditoria
| Tabela | Tamanho |
|---|---|
| `ddl_audit` | **15 MB** (75% do schema) |
| Demais (13 tabelas) | ~5 MB |

### financeiro (11 MB)
| Tabela | Tamanho |
|---|---|
| `vendas_unificadas` | 3.9 MB |
| `vendas_parcelas` | 2.9 MB |
| `pagamentos_diarios` | 2.4 MB |
| Demais (12 tabelas) | ~2 MB |

### Top 10 maiores tabelas (geral)
| # | Tabela | Tamanho | Linhas |
|---|---|---|---|
| 1 | `zapp.webhook_events_processed` | **111 MB** | 231.508 |
| 2 | `zapp.webhook_audit_log` | **93 MB** | 258.083 |
| 3 | `evo.evolution_messages_wpp2` | **66 MB** | 59.015 |
| 4 | `evo.evolution_contacts` | **32 MB** | 20.894 |
| 5 | `evo.evolution_webhook_events_v2_2026_07` | **23 MB** | 42.601 |
| 6 | `storage.objects` | **17 MB** | 16.207 |
| 7 | `ops.ddl_audit` | **15 MB** | 28.015 |
| 8 | `cron.job_run_details` | **13 MB** | 33.464 |
| 9 | `evo.evolution_media` | **13 MB** | 35.615 |
| 10 | `zapp.app_notifications` | **9.2 MB** | 11.943 |

> ⚠️ `webhook_events_processed` + `webhook_audit_log` = 204 MB (12.8% do banco). Considere políticas de retenção/purge.

---

## 4. 🐌 Slow Queries (pg_stat_statements)

**Fonte:** `pg_stat_statements` disponível e ativo ✅

### Top 10 por tempo total

| # | Query (resumo) | Chamadas | Tempo Total | Média | Máx |
|---|---|---|---|---|---|
| 1 | WAL realtime processing | **90.289** | **1.452 s** | 16.09 ms | 1.574 ms |
| 2 | `zapp.fn_system_health_score_cached()` | 383 | **129.150 ms** | 337 ms | 585 ms |
| 3 | Evolution event polling function | **127.762** | **69.945 ms** | 0.55 ms | 537 ms |
| 4 | `VACUUM ANALYZE evo.evolution_messages` | 16 | **64.684 ms** | 4.042 ms | 4.674 ms |
| 5 | Schema introspection (PostgREST) | 57 | **60.857 ms** | 1.067 ms | 1.257 ms |
| 6 | `ops.fn_regression_tests()` | 7 | **59.922 ms** | 8.560 ms | 8.941 ms |
| 7 | INSERT `financeiro.pagamentos_diarios` | **686.564** | **55.241 ms** | 0.08 ms | 21 ms |
| 8 | INSERT `webhook_events_processed` (via API) | 106.436 | 54.383 ms | 0.51 ms | 15 ms |
| 9 | PostgREST schema listing | 1.906 | 51.477 ms | 27 ms | 62 ms |
| 10 | INSERT `webhook_audit_log` (via API) | 106.444 | 44.422 ms | 0.42 ms | 23 ms |

### 🔴 Alertas

| Alerta | Detalhe |
|---|---|
| 🔴 **`fn_system_health_score_cached`** | 337 ms média, 585 ms máx — chamada 383 vezes. Pode estar causando lentidão no dashboard. |
| 🔴 **`fn_regression_tests`** | 8,5 *segundos* por execução — só 7 chamadas mas muito pesado. |
| 🔴 **Schema introspection** | 1.067 ms por chamada, 57 chamadas — PostgREST recarregando schema cache. |
| 🟡 **`VACUUM ANALYZE` manual** | 4 segundos cada — normal para manutenção, mas frequente (16x). |

> ✅ A maioria das inserts internos (pagamentos, webhooks) é **sub-1ms** — excelente performance transacional.

---

## 5. 🔒 Locks

| Métrica | Valor |
|---|---|
| **Total de locks ativos** | **0** ✅ |
| **Queries esperando lock** | **0** ✅ |
| **Cadeias de bloqueio** | **0** ✅ |

> ✅ **Sem contenção de locks.** Zero deadlocks, zero bloqueios. Ambiente transacional saudável.

---

## 6. 🧹 Vacuum & Bloat

### Schema `zapp` (destaques)

| Tabela | Dead Tuples | Bloat % | Último VACUUM | Vacuums |
|---|---|---|---|---|
| `vault_healthcheck_log` | 191 | **6.72%** 🟡 | 28/07 (manual) | 1 |
| `profiles` | 36 | **200%** 🔴 | 28/07 + autovacuum 23x | 1 manual + 23 auto |
| `_snapshot_version_state` | 36 | **3600%** 🔴 | 28/07 + autovacuum 376x | 1 manual + 376 auto |
| `integration_profiles` | 34 | **3400%** 🔴 | 28/07 (manual) | 1 (sem autovacuum!) |
| `sticker_categories` | 27 | 93% 🟡 | — | — |
| `contact_intelligence` | — | 0% ✅ | — | — |

> 🔴 **Bloat alto em tabelas pequenas:** `_snapshot_version_state` (3600%), `integration_profiles` (3400%), `profiles` (200%) — são tabelas pequenas com poucas linhas onde dead tuples se acumulam. Autovacuum está atuando na maioria, mas `integration_profiles` nunca rodou autovacuum e está preso a 1 vacuum manual.
> 🟡 `vault_healthcheck_log` com 6.72% de bloat — 191 dead tuples. Leve, mas monitorar.

### Schema `evo` (destaques)

| Tabela | Dead Tuples | Bloat % | Último VACUUM | Observação |
|---|---|---|---|---|
| `evolution_messages_wpp2` | 247 | 0.42% ✅ | Hoje (18:25) | 50 vacuums manuais + 31 auto 🟢 |
| `evolution_contacts` | 89 | 0.43% ✅ | Hoje (18:35) | 49 manuais + 18 auto 🟢 |
| `mv_daily_metrics` | 45 | **132%** 🟡 | 28/07 | Materialized view — esperado |
| `_snapshot_version_state` | 36 | **3600%** 🔴 | 28/07 + 360 autovacuums | Idem schema zapp |
| `evolution_webhook_events_wpp2` | 5 | **100%** 🟡 | 28/07 | Apenas 5 linhas — impacto mínimo |
| `mv_daily_kpis` | 2 | **200%** 🟡 | 28/07 + 2 autovacuums | MV, esperado |

> ✅ Tabelas grandes (`evolution_messages_wpp2`, `evolution_contacts`) com **bloat mínimo** — manutenção excelente com vacuums frequentes (50x!).
> ✅ Schema evo tem **autovacuum ativo** nas tabelas críticas.

### Schema `ops`

| Tabela | Dead Tuples | Bloat % | Vacuums |
|---|---|---|---|
| `redis_sentinel` | 24 | **2400%** 🔴 | 1 manual + 21 auto |
| `wal_alert_state` | 10 | **333%** 🟡 | 2 manuais + 9 auto |
| `backup_sentinel` | 3 | **300%** 🟡 | 1 manual, sem autovacuum |

> 🔴 `redis_sentinel` com bloat alto mas apenas 1 linha — impacto real mínimo.
> ⚠️ `backup_sentinel` sem autovacuum — considerar configurar.

---

## 7. ✅ Resumo do Health Check

### 🟢 Status Geral: **SAUDÁVEL**

| Categoria | Nota | Observação |
|---|---|---|
| **Servidor** | ✅ | PostgreSQL 15.8 estável, 2 dias de uptime |
| **Cache Hit Ratio** | ✅ **99.83%** | Praticamente tudo em memória — excelente |
| **Conexões** | ✅ | 38 total, sem idle-in-transaction |
| **Locks** | ✅ | Zero contenção |
| **Slow Queries** | 🟡 | `fn_system_health_score_cached` (337ms) e `fn_regression_tests` (8.5s) merecem atenção |
| **Disco** | ✅ | 1.56 GB total — tamanho moderado |
| **Vacuum/Bloat** | 🟡 | Bloat alto apenas em tabelas pequenas; tabelas grandes saudáveis |
| **Autovacuum** | ✅ | Ativo e funcionando nas tabelas críticas |

### 🔴 Ações Recomendadas

1. **Otimizar `fn_system_health_score_cached`** — 337ms de média, chamada 383x. Investigar se pode ser otimizada ou o cache ajustado.
2. **Otimizar `fn_regression_tests`** — 8.5 segundos por execução. Se crítica, rever lógica ou agendar fora do horário comercial.
3. **Reter tabelas de log** — `webhook_events_processed` (111 MB) + `webhook_audit_log` (93 MB) = 204 MB (~13% do banco). Implementar ou verificar política de retenção/purge.
4. **VACUUM manual em `backup_sentinel` e `integration_profiles`** — sem autovacuum, bloat acumulado. Rodar `VACUUM ANALYZE` manualmente.
5. **Schema introspection (PostgREST)** — 1 segundo por chamada, 57x. Verificar `db_schema` no config do PostgREST para limitar schemas escaneados.

### 🟡 Itens para Monitoramento

- `vault_healthcheck_log` com 6.72% de bloat — manutenção leve.
- Tabelas de webhook events particionadas por mês — boa prática, mas `evolution_webhook_events_v2_2026_07` já tem 23 MB e 42k linhas. Acompanhar crescimento.
- 38 conexões — verificar se `max_connections` comporta escalabilidade.
