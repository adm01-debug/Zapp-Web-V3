# 🔧 EVOLUTION_OPS_RUNBOOK — Operação e Manutenção da Evolution API

**Projeto:** EVO API · VPS AtomicaBR · **Fase E — etapa 97** · **Atualizado:** 08/08/2026
**Fonte:** artefatos de 08/08/2026 (`runbook-evolution-artifacts/`), verificação em produção
**Autor:** agente de governança (execução) · **Aplicação:** sempre via Portainer/maestro — NUNCA aplicar direto sem revisão

---

## 1. Propósito

Runbook operacional único da Evolution API (WhatsApp gateway) e do pipeline de eventos
Evolution → RabbitMQ → consumer → Supabase. Cobre inventário, manutenção preventiva,
incidentes e escalação. Comandos reais validados em produção em 08/08/2026.

**Documentos relacionados:**
- `POLITICA_ANTI_RESIDUOS.md` — regras de ciclo de vida de configs/secrets/imagens (etapa 98)
- `PLAYBOOK_INCIDENTE.md` — timeline e templates de incidente (etapa 99)
- `AUDITORIA_MENSAL.md` — checklist mensal com meta de 0 alertas no guardrail (etapa 100)

---

## 2. Inventário de serviços (stacks Swarm)

Acesso: Portainer → Stacks. Host manager da VPS. Comandos `docker` via container `docker:28-cli`
ou direto no manager.

| Stack ID | Stack | Papel | Imagem / detalhe | Réplicas |
|---|---|---|---|---|
| **20** | `postgres` | Banco da Evolution (postgres:14, volume `postgres_data`) — 717MB, 51 tabelas, top `Message` 405MB | `postgres:14` | 1 |
| **23** | `redis` | Cache — db8 = `evolution:baileys:*` (88 chaves, TTL=-1 — atenção) | redis | 1 |
| **25** | `evolution` | **Serviço principal** — Evolution API 2.3.7 custom (patches T1–T6), endpoints `evolution.atomicabr.com.br` | `ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:1e12bec1…` | 1 |
| **35** | `supabase` | Supabase self-hosted: `supabase_db` PG15.8.1.085 · `functions` edge-runtime v1.74.0 · `rest` postgrest v14.12 · `kong` 3.9.3 · `realtime` v2.102.3 · `auth` gotrue v2.189.0. Edge fn `evolution-webhook` valida HMAC (`EVOLUTION_WEBHOOK_SECRETS`). Secret `supabase_evolution_webhook_secret_v1` | múltiplos serviços | 1 (functions) |
| **113** | `evolution-rabbit-consumer` | Bridge RabbitMQ → Supabase: consome filas `wpp2.*` (17 filas), assina HMAC (`consumer.py:327`, `x-webhook-signature`), secret `supabase_webhook_secret_v1` | `ghcr.io/adm01-debug/zapp-web-v3/evolution-rabbit-consumer@sha256:e9d355…` | 2 (parallelism 1, start-first) |
| **124** | `supabase-backup` | Backup do Supabase — dumps `supabase_selfhosted_*.dump` em `/backups` (volume `supabase-backup_backup_data`) | `postgres:15-alpine` | 1 |
| **126** | `evolution-db-purge` | Retenção do banco evolution — purge v10 (config `purge_v10_20260808`), 24h de intervalo, advisory lock `233425868`, tabelas: Message 90d, MessageUpdate 30d, webhook_events 14d, baileys 30d, IsOnWhatsapp 7d, guardian 30d, audit 30d, DLQ 30d, warroom 30d | `postgres:14-alpine` + script via config | 1 |
| **195** | `mcp-health-monitor` | Observabilidade — healthcheck de 11 targets (evolution, n8n, zapp…), grava `public._mcp_health_events` | — | 1 |
| **220** | `volume-backup` | Backup offsite de volumes | — | 1 |
| **225** | `whatsapp-observer` | Observabilidade da instância WhatsApp | — | 1 |
| **226** | `reconcile-ops` | **Guardrail** — script `guardrail_script_v4` (8 checks: WAL-01, JWT-01, SCHEMA-01, EDGE-01, CRON-01, META-01, BACKUP-01, ALERT-01) em loop ~15min | `alpine:3.19` | 1 |
| **229** | `traefik-ops` | Collector de 401s do Traefik (host evolution) → `evo.evolution_traefik_401_stats` — config `traefik_401_collector_v3` (fix BusyBox date) | alpine | 1 |
| **230** | `whatsapp-watchdog` | Resiliência baileys + canary (`CANARY_NUMBER=551146375517` = self-ping wpp2, esperado http=201) | — | 1 |
| **231** | `realtime-keepalive` | Keepalive do Supabase Realtime — heartbeat 25s + `postgres_changes whatsapp_connections` (config `realtime_keepalive_v2`); realtime com limite 2G RAM | — | 1 |

**Fluxo de dados (jornada da mensagem):**
```
WhatsApp → Evolution API (25) → RabbitMQ (filas wpp2.*) → consumer (113, HMAC sha256)
        → edge fn evolution-webhook (35) → PostgREST → Supabase (35)
        → Zapp Web / n8n
```
Webhook nativo (header `x-webhook-secret`, 49% do tráfego) também alimenta a edge fn
(`ALLOW_SHARED_SECRET=true` — migração planejada fases M1–M5 em `docs/HMAC_ROTATION_PLAN.md`).

---

## 3. Procedimentos de manutenção

### 3.1 Rotacionar API key global da Evolution

**Referência:** etapa A1 (key v6 = `e5091b02-5f26-4262-9736-ad342045478b`; v5 revogada após exposição no body p/ Cloudflare).

```bash
# 1) gerar nova key (UUID)
NEW_KEY=$(cat /proc/sys/kernel/random/uuid)

# 2) criar secret versionado NOVO (nunca sobrescrever o ativo)
printf '%s' "$NEW_KEY" | docker secret create evolution_api_key_v7_$(date +%Y%m%d) -
# nota: manter o TARGET estável — a app lê /run/secrets/<target> fixo

# 3) atualizar TODOS os consumidores (ordem obrigatória):
#    stack 25 (evolution) → stack 230 (watchdog/canary) → worker evolution-mcp
#    (Cloudflare) → mcp-health-monitor (se tiver env EVO_*)
#    via Portainer: Stack 25 → Edit → secrets/command → Apply

# 4) validar
curl -s -H "apikey: $NEW_KEY" https://evolution.atomicabr.com.br/instance/fetchInstances | head -c 200
docker service logs evolution_evolution --since 10m | grep -c "\[SERVER\] Unauthorized"   # = 0

# 5) janela de observação 24h → revogar a key antiga no stack 25 (env AUTHENTICATION_API_KEY)
```

> ⚠️ Regra de ouro: a key global NUNCA vai em webhooks de erro (etapa 8). Erros vão pro Sentry.

### 3.2 Rotacionar webhook secret (HMAC) — zero-downtime

**Referência completa:** `docs/HMAC_ROTATION_PLAN.md` (fases 1–8, riscos R1–R7). Resumo executável:

```bash
# F1 — gerar v2 (96 chars hex, SEM vírgula, SEM newline)
NEW_SECRET=$(openssl rand -hex 48)          # printf '%s' — NUNCA echo (newline quebra HMAC 100%)
printf '%s' "$NEW_SECRET" | docker secret create supabase_evolution_webhook_secret_v2 -
# F3 — stack 35: EVOLUTION_WEBHOOK_SECRETS=v2,v1 (slot 0 = primary; multi-secret aceita ambos)
#      deploy stop-first, replicas 1 → 5–30s de 503 (retries cobrem)
# verificar (5 min): logs com "slot=1 rotation-tail" = consumer ainda em v1 (esperado)
docker service logs supabase_functions_functions --since 5m | grep -E "slot=|rejected|Invalid" | tail -50
# F5 — stack 113: trocar source p/ v2 com target preservado (código lê path v1)
#      source: supabase_evolution_webhook_secret_v2 / target: supabase_webhook_secret_v1
# verificar: "slot=0 primary" e ZERO "rotation-tail"
# F6.5 — atualizar header nativo da instância (ANTES de remover v1, senão auto-pause 15min):
curl -X POST https://evolution.atomicabr.com.br/webhook/set/wpp2 \
  -H "apikey: <EVO_KEY>" -H "Content-Type: application/json" \
  -d '{"enabled":true,"url":"<URL_ATUAL>","headers":{"x-webhook-secret":"<V2>","x-evolution-instance":"wpp2"},"events":[...]}'
# F7 — remover v1 do stack 35 (command + secrets) — só após 24h com slot=0
# F8 — remover secrets v1 (72h limpos):
docker secret rm supabase_evolution_webhook_secret_v1 supabase_webhook_secret_v1
```
**Gates de segurança:** `printf '%s'` (sem newline) · fases em ordem estrita · remoção de v1
somente após 24h de `slot=0` e 72h sem `Invalid`/`rejected`.

### 3.3 Redeploy de edge function (ex.: evolution-webhook)

```bash
# 1) bundle (supabase CLI) ou zip; 2) deploy via curl com service key:
curl -sS -X POST "https://<SUPABASE_HOST>/functions/v1/evolution-webhook" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "x-supabase-functions-version: <nova-versao>" \
  -F "file=@evolution-webhook.zip"
# 3) validar contrato:
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://<SUPABASE_HOST>/functions/v1/evolution-webhook   # 401/503 sem assinatura = vivo (fail-closed OK)
# 4) logs pós-deploy (24h):
docker service logs supabase_functions_functions --since 24h | grep -cE "Invalid webhook signature|Invalid webhook shared secret"  # = 0
# 5) conferir slot do HMAC: grep "slot=" — se "rotation-tail" persistir >24h, algum produtor ainda assina o secret antigo
```
Manifest de referência (drift repo×runtime): config `guardrail_edge_functions_v2` — reconciliar com `edgefn/SYNC_VERDICT.md` (14 MISSING / 105 STALE / 1 ORPHAN em 08/08 — pendente etapa B2).

### 3.4 Purge manual / verificação do purge

```bash
# Verificar último ciclo (esperado: 1×/dia, zero "syntax error", lock ok):
docker service logs evolution-db-purge_purge --since 26h | grep -E "purged|VACUUM|lock|ERROR|syntax" | tail -40
# Estado dos runs (via container purge como host psql read-only):
PG_URL=$(cat /run/secrets/pg_evolution_url_n8n_app_v1)  # dentro do container purge (stack 126)
psql "$PG_URL" -t -A -c "SELECT id, ran_at, tabela, linhas_removidas, duration_ms, status FROM _purge_runs ORDER BY ran_at DESC LIMIT 5;"
```
**Purge manual (emergência — crescimento de tabela):** o deploy do script é do MAESTRO.
NUNCA rodar DELETE manual em produção. Para estourar retenção fora do ciclo: criar config nova
`purge_vN_YYYYMMDD` (gzip+base64, ver §4.6) com envs de retenção reduzidas e atualizar stack 126.

### 3.5 Restart do Supabase Realtime / keepalive

```bash
# 1) diagnóstico ANTES (regra de ouro: atribuir dono do slot — ver AUDITORIA_MENSAL §4.3):
# 2) restart do serviço (Portainer stack 35, serviço realtime) OU:
docker service update --force supabase_realtime
# 3) validar keepalive reconectou (stack 231):
docker service logs realtime-keepalive_keepalive --since 10m | tail -20      # heartbeat 25s
# 4) validar tenant seed no boot:
# SELECT * FROM _realtime.tenants;   (inserted_at ≈ hora do boot)
# SELECT count(*) FROM realtime.messages WHERE inserted_at > now() - interval '10 minutes';
# 5) conferir memória: Portainer → container realtime → HostConfig.Memory = 2147483648 (2G), OOMKilled=false
```
> PITFALL: lag alto em slot do Logflare NÃO se resolve reiniciando o Realtime — reinicie o container dono
> (ver `wal-slot-lag-monitoring`: coluna `database` do slot decide o dono, não o nome `cainophile_*`).

### 3.6 Restore de backup (Supabase — stack 124)

```bash
# 1) listar dumps disponíveis (volume supabase-backup_backup_data):
docker exec <container-supabase-backup> ls -lh /backups/ | tail -10
#    ex.: supabase_selfhosted_20260808_135218.dump (96,5MB em 08/08 — sentinel 60MB)
# 2) restaurar (pg_restore no supabase_db; PARAR serviços dependentes primeiro — zapp-web, n8n):
docker exec <supabase_db> pg_restore --clean --if-exists -U postgres -d postgres \
  < /backups/supabase_selfhosted_<data>.dump    # via volume ou docker cp
# 3) validar: consultas de saúde (tabelas críticas), auth users, RLS policies
# 4) passphrase dos backups: NUNCA remover a passphrase antiga antes de os backups antigos expirarem
#    (restauração histórica fica impossível — perda DR irreversível)
```

### 3.7 Deploy de config gzip (padrão oficial — purge, guardrail, collectors)

```bash
# configs grandes (scripts) SEMPRE via gzip+base64 (configs Swarm têm limite de 500KB):
gzip -c script.sh | base64 -w0 > script.b64
# criar no swarm (manager): conteúdo vem do host; o compose monta em /tmp/<nome> (mode 0444)
docker config create purge_v10_20260808 /tmp/purge-v10.sh        # ex. real
# atualizar stack: configs.purge.source + entrypoint `exec sh /tmp/purge-v10.sh`
# VALIDAR 1º ciclo: logs sem "syntax error", ROWS coerente, lock adquirido/liberado
```

---

## 4. Runbooks de incidente (resumo — detalhe completo no PLAYBOOK_INCIDENTE.md)

| Incidente | Detecção | Ação imediata (5–15 min) | Ação de mitigação |
|---|---|---|---|
| **WhatsApp desconectado** (instância offline) | Canary stack 230 http≠201 · `evo_status` · alerta Sentry | Verificar instância: `GET /instance/fetchInstances` + logs stack 25 | Reconnect via QR/pairing; se falha de auth repetida (10/60s), auto-pause 15min — NÃO forçar; investigar `instance_auth_events` |
| **WAL lag alto** | Guardrail WAL-01 (≥2000MB, 2 amostras) · logs realtime | Diagnóstico: `pg_replication_slots` + `pg_stat_replication` (atribuir dono ANTES de agir) | Restart do container dono; 2G RAM confirmado; nunca dropar slot por nome |
| **Consumer parado** | `_consumer_dlq` crescendo · `evolution_rabbit_consumer_stats` parado · filas RMQ acumulando | Logs stack 113 (`docker service logs evolution-rabbit-consumer_consumer`), checar MAX_DELIVERY=3/backoff | Restart serviço (start-first, replicas 2); replay do DLQ (`status='replayed'`); validar HMAC (secret v2) |
| **Backup falho** | Guardrail BACKUP-01 (dump < 60MB ou idade > 26h) | Verificar `ls -lh /backups/` + logs stack 124 | Rodar dump manual; investigar sentinel; NUNCA reduzir sentinel sem análise |
| **CORS outage** | 500 `Not allowed by CORS` nos logs · zapp-web sem dados | Rollback: CORS_ORIGIN → `*` (ou lista anterior) + reaplicar stack 25 | Ver `cors/CORS_FIX_PLAN.md`; lista restrita SEM `*`; incluir SEMPRE `https://evolution.atomicabr.com.br` (healthcheck) e origens sem-Origin (curl/n8n/edge fn/MCP) — patch custom 1 linha |

---

## 5. Contatos e alertas

| Canal | O que recebe | Ação |
|---|---|---|
| **Sentry** | Erros de runtime (evolution, edge fns — `WEBHOOK_EVENTS_ERRORS=false` redireciona erros p/ Sentry) | Triagem de exceções novas; issues de erro crônico |
| **n8n warroom** | Alertas do guardrail (tabela `warroom_alerts`) | Painel central de alertas; workflows de notificação |
| **Guardrail (stack 226)** | 8 checks em loop ~15min: WAL-01, JWT-01, SCHEMA-01, EDGE-01, CRON-01, META-01, BACKUP-01, ALERT-01 | `docker service logs reconcile-ops_guardrail --since 30m \| grep -E "RESUMO\|ALERTA"` |
| **Monitor 401 (stack 229)** | `evo.evolution_traefik_401_stats` (janelas 5min, ~6.5K/h de 401s) | Picos de 401 = chave/secrets inválidos ou CORS quebrado |
| **MCP health (stack 195)** | `public._mcp_health_events` — 11 targets (evolution, n8n, zapp…) | Eventos DOWN/RECOVERED |

**Escalação:** operador (agente) → maestro (deploy) → dono do serviço (Joaquim). Incidentes P1
(WhatsApp fora) → warroom imediato + n8n + Sentry issue.

---

## 6. Referências de artefatos (08/08/2026)

| Artefato | Conteúdo |
|---|---|
| `docs/EVOLUTION-ANALISE-100-ETAPAS.md` | Análise completa + 100 etapas de correção |
| `docs/EXECUTION_PROGRESS.md` | Progresso por etapa (22 ✅ / 1 🔄 / 77 ⬜) |
| `docs/HMAC_ROTATION_PLAN.md` | Rotação HMAC zero-downtime (fases 1–8) |
| `guardrail/GUARDRAIL_V4_README.md` | Guardrail v4: checks, envs, deploy, rollback |
| `higiene/HIGIENE_README.md` + `HIGIENE_EXEC.sh` | Higiene ~3.05GB imagens + 2 secrets + 16 configs |
| `monitors/MONITORS_DEPLOY_ORDER.md` | Deploy 195 → 229, validação e rollback |
| `db/` | Crons fix, drop schema evo, purge v10 |
| `edgefn/SYNC_VERDICT.md` | Drift edge functions repo×runtime |
| `compose/COMPOSE_DRIFT_FINAL.md` | Compose canônico da Evolution |
