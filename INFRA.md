# INFRA.md — Mapa de Infraestrutura EVO API / ZAPP WEB

**Última atualização:** 2026-07-10 Sessão 8 (auditoria exaustiva 300 cenários)
**Score:** 9.8/10 — pendênte apenas burn-in 7 dias e start_period MW

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

- **Exchange `evolution`** (topic, durable): `alternate-exchange=evolution.ae` ✅ **LINKED sessão 8**
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
| 171 | `evo-sync-messages-to-v2` | `*/5 * * * *` | Sync messages→v2 (sessão 8) |
| 172 | `evo-instance-health-check` | `*/10 * * * *` | Atualiza health_status (sessão 8) |
| 173 | `evo-detect-401-bursts` | `*/15 * * * *` | Detecta Caller B retornando |
| 153 | `v2-pipeline-heartbeat` | desativado | (substituído pelo sync real) |
| ~171 | `auto-probe-15min` | `*/15 * * * *` | Sonda E2E |

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
https://whats-your-line.lovable.app    # app Lovable publicado (manter)
https://zapp.atomicabr.com.br          # domínio principal
https://supabase.atomicabr.com.br      # Supabase self-hosted
https://zapp-web-v3.vercel.app         # Vercel produção (adicionado sessão 7)
```
Removido: `id-preview--22c0b518-7895-4f4f-9ea0-978457a2c37a.lovable.app`

## 7. Security

- `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false` ✅
- T4 logpatch: api_key mascarada nos logs ✅
- Vault: `evolution_api_key = 2D10188F...` ✅
- RLS: 100% das tabelas evo/zapp/ops ✅
- 9 tabelas sem PK receberam REPLICA IDENTITY FULL (sessão 8) ✅
- Caller B 52.67.175.207: cron de detecção de 401 burst `/15min` ativo ✅

## 8. Gates 10/10 — Status

| Gate | Status |
|---|---|
| Sonda E2E verde (<10min gap) | ✅ gap<5min |
| Pipeline RabbitMQ 17/17 | ✅ |
| Backfill v2 mirror | ✅ 10.865 + 3317 live |
| Token seguro | ✅ |
| Restore Baileys testado | ✅ |
| Drift stack=0 | ✅ |
| Alerta externo testado <30min | ✅ <3min |
| Runbooks | ✅ INFRA.md + DB |
| **E1b alternate-exchange** | ✅ **LINKED sessão 8** |
| **Consumer max_attempts=0** | ✅ **Sessão 8** |
| Burn-in 7 dias | ⏳ 0/7 (iniciado 10/07) |
| start_period 90→120s | ⏳ próximo MW |

---
*Atualizado automaticamente após auditoria 300 cenários. Score: 9.8/10.*
