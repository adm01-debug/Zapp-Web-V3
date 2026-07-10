# INFRA.md — Mapa de Infraestrutura EVO API / ZAPP WEB

**Última atualização:** 2026-07-10 (Auditoria sessão 6)
**Autor:** Gerado por Claude (Dev Senior) via Auditoria EVO API

> **BANCO CANÔNICO: `supabase.atomicabr.com.br` (self-hosted VPS)**
> O projeto Lovable Cloud `allrjhkpuscmgbsnmjlv` foi DESCONTINUADO em 30/06/2026. Zero dados ativos. Não usar.

---

## 1. Stacks Docker Swarm (Manager: AtomicaBR)

| Stack ID | Nome | Função | Status |
|---|---|---|---|
| #25 | `evolution` | Evolution API v2.3.7 (WhatsApp) | ✅ Ativo |
| #35 | `supabase` | Supabase self-hosted (PG15.8, Kong, Auth, Storage, Functions) | ✅ Ativo |
| #24 | `n8n` | N8N 2.25.7 queue mode (worker + scheduler) | ✅ Ativo |
| #23 | `redis` | Redis DB8 (sessões Baileys + cache) | ✅ Ativo |
| #20 | `postgres` | PostgreSQL 14.22 (banco `evolution` — PG14) | ✅ Ativo |
| #111 | `rabbitmq` | RabbitMQ vhost=evolution (AMQP broker) | ✅ Ativo |
| #113 | `evolution-rabbit-consumer` | Consumer Python (v16-wpp2-only) | ✅ Ativo |
| #109 | `watchdog-baileys` | Watchdog wpp2 (health check + restart) | ✅ Ativo |
| #116 | `baileys-backup` | Backup Redis session → R2 (6h interval) | ✅ Ativo |
| #117 | `dlq-inspector` | Inspetor DLQ RabbitMQ | ✅ Ativo |
| #118 | `wa-version-monitor` | Monitor versão WhatsApp | ✅ Ativo |
| #119 | `baileys-error-monitor` | Monitor erros Baileys | ✅ Ativo |
| #120 | `swarm-task-guardian` | Guardião de tasks Swarm | ✅ Ativo |
| #124 | `supabase-backup` | Backup Supabase → R2 (diário) | ✅ Ativo |
| #126 | `evolution-db-purge` | Purge banco Evolution (PG14) | ✅ Ativo |
| #165 | `zapp-health-guard` | Health guard ZAPP Web | ✅ Ativo |
| #167 | `host-disk-guard` | Monitor disco do host | ✅ Ativo |

---

## 2. Serviços Principais

### Evolution API (wpp2)
- **URL:** `https://evolution.atomicabr.com.br`
- **Instância:** `wpp2` (UUID: `f7a73e2c-327d-426c-8fa6-6ea7743ace02`)
- **Imagem:** `evoapicloud/evolution-api@sha256:6b195676...` (build 05/12/2025)
- **API Key:** Docker secret `evolution_api_key_v4_20260704` (2D10188F...)
- **AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES:** `false` ✅
- **Logpatch:** v1.5-T1T2T3T4T5 (CACHE, LGPD, Sentry, api_key mask)
- **RabbitMQ exchange:** `evolution` (17 bindings → wpp2.*)

### Supabase Self-Hosted
- **URL externa:** `https://supabase.atomicabr.com.br`
- **URL interna:** `http://kong:8000`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24i...rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk`
- **Schemas:** `public, zapp, evo, ops, artes, vendas, financeiro, storage, graphql_public`
- **Crons ativos:** 95
- **Vault secrets:** 26 (inclui `evolution_api_key`, `evolution_api_url`)
- **Edge Functions:** 60+ (inclui `evolution-credentials`, `connection-health-check`, `evolution-webhook`, `evolution-sender`)

### RabbitMQ
- **URL:** AMQP via secret `rabbitmq_url_evolution_v1`
- **Vhost:** `evolution`
- **Exchanges:** `evolution` (topic, 17 bindings), `wpp2` (direct, 17 bindings), `wpp2.dlx` (fanout)
- **Filas:** 17 filas `wpp2.*` (quorum), 1 DLQ `wpp2.dlq`, 1 `unroutable.audit`

### Redis
- **Host:** `redis:6379` / DB8
- **Session key:** `evolution:instance:f7a73e2c-327d-426c-8fa6-6ea7743ace02` (sem TTL)
- **Backup:** Stack #116 → R2 bucket `evolution-backups/backups/baileys-session/` (6h)
- **AOF+RDB:** ativos

---

## 3. Configs Docker (externos) — Evolution

| Config | Propósito |
|---|---|
| `evolution_main_v2_js` | main.js original (dist) |
| `evolution_main_v2_mjs` | main.mjs original |
| `evolution_logpatch_t4_cjs` | Prológo T4 (mascara api_key em logs) |
| `evolution_consumer_v5_2` | consumer.py base (patcheado no entrypoint) |

---

## 4. Secrets Docker relevantes

| Secret | Conteúdo | Rotação |
|---|---|---|
| `evolution_api_key_v4_20260704` | API Key Evolution (2D10188F...) | 04/07/2026 |
| `evolution_db_uri_v1` | DB URI superuser (Prisma migrations) | — |
| `evolution_db_uri_evolution_app_v1` | DB URI least-privilege (runtime) | — |
| `rabbitmq_url_evolution_v1` | URL AMQP RabbitMQ | — |
| `rabbitmq_url_evolution_v2` | URL AMQP v2 (consumer) | — |
| `r2_s3_access_key_v2` | R2 Cloudflare access key | — |
| `r2_s3_secret_key_v2` | R2 Cloudflare secret key | — |
| `supabase_service_key_v1` | Supabase service role key | — |
| `supabase_jwt_secret_v1` | JWT secret Supabase | — |
| `supabase_evolution_webhook_secret_v1` | HMAC secret para evolution-webhook | — |

---

## 5. Pipeline de Eventos

```
                        ┌─────────────────────────────┐
   WhatsApp Cloud ──── │  Evolution API (wpp2)       │
                        │  port 8080, image 6b195676  │
                        └──────────────┬──────────────┘
                                       │ AMQP publish
                                       ▼
                        ┌─────────────────────────────┐
                        │  RabbitMQ vhost=evolution   │
                        │  exchange=evolution (topic) │
                        │  17 bindings → wpp2.*       │
                        └──────────────┬──────────────┘
                                       │ AMQP consume
                                       ▼
                        ┌─────────────────────────────┐
                        │  Consumer Python v16         │
                        │  wpp2-only (17 filas)       │
                        └──────────────┬──────────────┘
                                       │ HMAC POST
                                       ▼
                        ┌─────────────────────────────┐
                        │  Edge Fn: evolution-webhook │
                        │  supabase.atomicabr.com.br  │
                        └──────────────┬──────────────┘
                                       │ INSERT
                                       ▼
                        ┌─────────────────────────────┐
                        │  evo.evolution_webhook_     │
                        │  events_v2 (particionado)   │
                        │  + evo.evolution_messages   │
                        │  + evo.evolution_contacts   │
                        └─────────────────────────────┘
```

---

## 6. URLs e Endpoints

| Serviço | URL Externa |
|---|---|
| Evolution API | `https://evolution.atomicabr.com.br` |
| Supabase | `https://supabase.atomicabr.com.br` |
| N8N | `https://n8n.atomicabr.com.br` (interno) |
| Portainer | `https://portainer.atomicabr.com.br` |
| GlitchTip (Sentry) | `https://erros.atomicabr.com.br` |
| R2 Media Proxy | `https://zapp-media-proxy.adm01.workers.dev` |
| RabbitMQ Management | `https://rabbitmq.atomicabr.com.br` (interno) |

---

## 7. Alertas e Observabilidade

- **Sonda E2E:** `evo.fn_pipeline_health_probe()` — cron `*/15 * * * *`
  - Thresholds BRT: comercial crit=20min, warn=10min; noturno crit=60min, warn=30min
  - Log: `evo.evolution_pipeline_health_log`
- **Alerta externo:** `ops.notification_config` → n8n webhook `webhook.atomicabr.com.br/webhook/zapp-webb-critical-alert` → Bitrix24
- **Canal WhatsApp:** grupo `120363221646752578@g.us` via wpp2
- **GlitchTip:** Sentry DSN ativo, tracesSampleRate=0.05
- **Prometheus:** `PROMETHEUS_METRICS=true`, auth=basic, scrape pendente

---

## 8. Frontend (ZAPP Web)

- **Repo:** `adm01-debug/zapp-web-v3` (GitHub, público)
- **Deploy:** Vercel (team juca1, project `prj_WINX0TJyvKgQP8LdDikPMx874BNN`)
- **URL:** `https://zapp-web-v3.vercel.app`
- **Supabase URL:** `https://supabase.atomicabr.com.br` (self-hosted canônico)
- **Evolution key:** Obtida em runtime via Edge Fn `evolution-credentials` → Vault
- **Frameworks:** Vite + React + TypeScript + Tailwind + shadcn/ui

---

## 9. Projetos DESCONTINUADOS (NÃO USAR)

| Projeto | Ref | Status | Data |
|---|---|---|---|
| Lovable Cloud (ZAPP) | `allrjhkpuscmgbsnmjlv` | ❌ Descontinuado | 30/06/2026 |
| Supabase ZAPP MCP (Lovable) | `uqysyzndkfiwfztbqvsl` | ❌ Descontinuado | — |
| wpp_pink_test | UUID `a422ee94-...` | ❌ Deletada | 10/07/2026 |

---

## 10. Runbooks Rápidos

| Cenário | Ação |
|---|---|
| wpp2 offline | `docker service update --force evolution_evolution` |
| QR perdida | Watchdog auto-reconecta; se falhar: `evo_instance_connect(wpp2)` |
| Consumer parado | `docker service update --force evolution-rabbit-consumer_consumer` |
| Bindings perdidos | Verificar `rabbitmqctl list_bindings -p evolution`; recriar via RabbitMQ API |
| Restore Baileys | Copiar `auto-*.json.gz` do R2, gunzip, restaurar via `HSET` Redis |
| Backfill espelho | `INSERT INTO evo.evolution_webhook_events_v2 SELECT ... FROM evo.evolution_messages WHERE ...` |

*Para runbooks completos: `SELECT fn_get_incident_runbook(null)` no self-hosted*

---

*Este arquivo é gerado automaticamente após cada auditoria. Fonte: MCPs Portainer + Supabase + RabbitMQ + GitHub.*
