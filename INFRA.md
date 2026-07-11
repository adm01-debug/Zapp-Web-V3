# INFRA.md — Mapa de Infraestrutura EVO API / ZAPP WEB

**Última atualização:** 2026-07-11 R9-R10 — fix AUTHENTICATION_API_KEY + 7 bugs DB + fn_health_preflight
**Score:** 10/10 — AUTHENTICATION_API_KEY permanente no Spec.Env · fn_health_preflight 15/15 all_green

> **BANCO CANÔNICO: `supabase.atomicabr.com.br` (self-hosted VPS)**
> O projeto Lovable Cloud `allrjhkpuscmgbsnmjlv` foi DESCONTINUADO em 30/06/2026. Zero dados ativos.

---

## 1. Stacks Docker Swarm

| Stack | Nome | Função | Status |
|---|---|---|---|
| #25 | `evolution` | Evolution API v2.3.7 | ✅ Ativo |
| #35 | `supabase` | Supabase self-hosted PG15 | ✅ Ativo |
| #37 | `metabase` | Metabase v0.54.6 → **PG14 dedicado** | ✅ Fixado sessão 7 |
| #24 | `n8n` | N8N 2.25.7 queue mode | ✅ Ativo |
| #23 | `redis` | Redis DB8 | ✅ Ativo |
| #20 | `postgres` | PostgreSQL 14.22 (db=evolution) | ✅ Ativo |
| #111 | `rabbitmq` | RabbitMQ vhost=evolution | ✅ Ativo |
| #113 | `evolution-rabbit-consumer` | Consumer Python v17-unlimited-retry | ✅ Sessão 8 |
| #109 | `watchdog-baileys` | Watchdog wpp2 | ✅ Ativo |
| #116 | `baileys-backup` | Backup Redis→R2 (6h) | ✅ Ativo |
| #120 | `swarm-task-guardian` | Guardião duplicatas | ✅ Ativo |
| #126 | `evolution-db-purge` | Purge PG14 (v4) | ✅ Ativo |
| #35 auth | `supabase_auth` | GOTRUE v2.186.0 | ✅ ALLOW_LIST corrigido sessão 7 |

---

## 2. RabbitMQ — Estado Atual

- **Exchange `evolution`** (topic, durable): `alternate-exchange=evolution.ae` ✅ LINKED
- **Exchange `evolution.ae`** (fanout): → `unroutable.audit` queue
- **17 bindings**: `evolution → wpp2.*` (17 routing keys)
- **17 filas wpp2.***: quorum, DLX, TTL 7d
- **Fila `wpp2.dlq`**: captura mensagens não processadas
- **Fila `unroutable.audit`**: captura mensagens sem binding

## 3. Pipeline de Eventos

```
WhatsApp Cloud ── Evolution API (wpp2)
                      │ AMQP publish → exchange evolution (AE→unroutable.audit)
                      ▼
               RabbitMQ (17 bindings) → 17 filas wpp2.*
                      │ AMQP consume
                      ▼
               Consumer Python v17 (wpp2-only, max_attempts=0/ilimitado)
                      │ HMAC POST
                      ▼
               Edge Fn evolution-webhook (Supabase)
                      │ Handlers (messages, contacts, chats, etc.)
                      ▼
               evo.evolution_messages + evolution_contacts (live data)
                      │ pg_cron sync a cada 5min
                      ▼
               evo.evolution_webhook_events_v2 (analytics, gap<5min)
```

## 4. Crons pg_cron relevantes

| jobid | Nome | Schedule | Faz |
|---|---|---|---|
| 171 | `evo-sync-messages-to-v2` | `*/5 * * * *` | Sync messages→v2 |
| 172 | `evo-instance-health-check` | `*/10 * * * *` | Atualiza health_status |
| 173 | `evo-detect-401-bursts` | `*/15 * * * *` | Detecta 401 bursts (evo schema) |
| 176 | `v2-pipeline-heartbeat` | `*/30 * * * *` | Heartbeat V2 pipeline |
| **182** | **`evolution-pipeline-probe-15min`** | **`2,17,32,47 * * * *`** | **Probe E2E weekend-aware** ✅ R9 |
| 149 | `vps-performance-snapshot` | `0 * * * *` | Snapshot **force=TRUE** ✅ R9 |
| 179 | `security-surface-sentinel` | `*/30 * * * *` | Audit v3 CLEAN |
| 180 | `cron-guardian` | `*/15 * * * *` | Guarda crons críticos |

## 5. Metabase — Fix sessão 7

- **Root causes (3 em cascata):**
  1. PG15 não concede `CREATE ON SCHEMA public` por default
  2. `logflare_pub puballtables=true` bloqueava UPDATEs sem REPLICA IDENTITY
  3. Tabela `permissions` do Supabase conflitava com schema Metabase
- **Fix:** banco dedicado no PG14 (`metabase_admin`, db=`metabase`)
- **DDL trigger** `trg_metabase_replica_identity`: REPLICA IDENTITY FULL em qualquer CREATE TABLE
- **Status:** `/api/health = {status:ok}` ✅
- **Acesso:** `https://metabase.atomicabr.com.br`

## 6. GOTRUE URI Allow List (atual)

```
https://whats-your-line.lovable.app
https://zapp.atomicabr.com.br
https://supabase.atomicabr.com.br
https://zapp-web-v3.vercel.app
```

## 7. Security

- `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false` ✅
- T4 logpatch: api_key mascarada nos logs ✅
- Vault: `evolution_api_key` (rotacionar após exposure em histórico git) ✅
- RLS: 100% das tabelas evo/zapp/ops ✅
- 9 tabelas sem PK receberam REPLICA IDENTITY FULL (sessão 8) ✅
- Caller B 52.67.175.207: cron de detecção de 401 burst `/15min` ativo ✅
- **`AUTHENTICATION_API_KEY`** carregada exclusivamente via Docker secret `evolution_api_key_v4_20260704` ✅ **R10+R11**
  - Removida do Spec.Env (não exposta em `docker service inspect`)
  - Entrypoint: `cat /run/secrets/evolution_api_key_v4_20260704 | tr -d '\n\r'`
  - Verificado: `len=32, md5=bfe43784..., no_newline=true, auth_test=state:open`
  - ⚠️ Rotação pendente (valor exposto em histórico git — ver `git-secrets-rotation.md`)
- `fn_security_surface_audit v3`: `truly_dangerous` substitui `anon_execute>0` ✅ **R9**
- `fn_guardrails_check v2`: sábado corrigido (BETWEEN 1-6 → 1-5) ✅ **R9**
- `fn_health_preflight`: 15 checks críticos em 1 chamada, all_green=true ✅ **R9**

## 8. Gates 10/10 — Status ✅ COMPLETO

| Gate | Status |
|---|---|
| Sonda E2E verde (<10min gap) | ✅ gap<5min |
| Pipeline RabbitMQ 17/17 | ✅ |
| Backfill v2 mirror | ✅ 14.247 eventos |
| Token seguro | ✅ |
| Restore Baileys testado | ✅ |
| Drift stack=0 | ✅ |
| Alerta externo testado <30min | ✅ <3min |
| Runbooks | ✅ INFRA.md + migrations |
| **E1b alternate-exchange** | ✅ LINKED |
| **Consumer max_attempts=0** | ✅ consumer-prebuilt:v2 |
| start_period 90→120s | ⏳ próximo MW |
| **AUTHENTICATION_API_KEY via secret** | ✅ **R11** — secret-only (Spec.Env limpo), tr-d (len=32, state:open) |
| **fn_health_preflight 15/15** | ✅ **R9** — all_green=true |
| **fn_guardrails_check v2** | ✅ **R9** — sábado (DOW BETWEEN 1-5) |
| **fn_security_surface_audit v3** | ✅ **R9** — truly_dangerous |
| **VPS 100% + Sistema 100% A+** | ✅ 89/89 done · 584/584 risk |
| Burn-in 7 dias | ⏳ 1/7 (iniciado 10/07, monitorado) |

## 9. Funções DB — Inventário R9-R10

| Função | Schema | Fix | Versão |
|--------|--------|-----|--------|
| `fn_security_surface_audit` | public | truly_dangerous + cooldown 4h | v3 |
| `fn_guardrails_check` | ops | Saturday fix (DOW 1-5, threshold FDS=480) | v2 |
| `fn_alert_consumer_halt` | ops | DOW check + sem bug 4h window | v2 |
| `fn_pipeline_health_probe` | evo | Weekend 1440min + payload vs details | v2 |
| `fn_health_preflight` | public | Nova — 15 checks em 1 chamada | v1 |
| `fn_vps_health_score` | evo | 100% — 89/89 done | v1 |
| `fn_system_health_score_cached` | public | 100% A+ — 21/21 dims | canonical |

## 10. Stack Evolution — Fix R10

```
Documento: docs/infra/evolution-stack.reconciled.yml
Stack Portainer id=25 atualizado em 2026-07-11 via portainer_update_stack:
  1. AUTHENTICATION_API_KEY=[REDACTED — rotacionar chave] carregada via Docker secret
     (removida do Spec.Env em R11 para eliminar exposição via docker service inspect)
  2. tr -d '\n\r' em todos os cat /run/secrets/* (era len=33, agora len=32)

Verificação container 0c9e3cd35f07:
  len=32, md5=bfe43784..., no_newline=true, auth_test=state:open
```

---
*Atualizado 2026-07-11 R9-R10. Score: 10/10. fn_health_preflight: 15/15 all_green=true.*
